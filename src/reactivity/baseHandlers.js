
import { isObject, isArray, isIntegerKey, hasOwn, hasChanged, TriggerOpTypes, isSymbol } from "../shared/index.js"
import { toRaw, readonly, isReadonly, isShallow, reactive, reactiveMap, shallowReactiveMap, readonlyMap, shallowReadonlyMap, ReactiveFlags } from "./reactive.js"
import { isRef } from './ref.js'
import { track, trigger, pauseTracking, resetTracking } from './effect.js'

const builtInSymbols = new Set(
    /*#__PURE__*/
    Object.getOwnPropertyNames(Symbol)
        // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
        // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
        // function
        .filter(key => key !== 'arguments' && key !== 'caller')
        .map(key => Symbol[key])
        .filter(isSymbol)
)

const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations()

function createArrayInstrumentations() {
    const instrumentations = {}
    const listNoChangeArrayLength = ['includes', 'indexOf', 'lastIndexOf']
    const listChangeArrayLength = ['push', 'pop', 'shift', 'unshift', 'splice']
    listNoChangeArrayLength.forEach(key => {
        instrumentations[key] = function (...args) {
            const arr = toRaw(this)
            for (let i = 0, l = this.length; i < l; i++) {
                // 每个索引都需要进行收集依赖
                track(arr, i + '')
            }
            // 调用原始对象上的方法
            const res = arr[key](...args)
            if (res === -1 || res === false) {
                // 如果没有找到，可能参数中有响应式对象，将参数转为其原始对象继续调用方法
                return arr[key](...args.map(toRaw))
            } else {
                return res
            }
        }
    })
    listChangeArrayLength.forEach(key => {
        instrumentations[key] = function (...args) {
            // 暂停依赖收集，这些修改数组长度的方法会造成effect函数的死循环，在执行该方法前停止依赖收集，执行完成后再恢复依赖收集
            pauseTracking()
            const res = toRaw(this)[key].apply(this, args)
            resetTracking()
            return res
        }
    })
    return instrumentations
}

// 重写obj.hasOwnProperty方法，对key进行依赖收集
function hasOwnProperty(key) {
    const obj = toRaw(this)
    track(obj, key)
    return obj.hasOwnProperty(key)
}

class BaseReactiveHandler {
    constructor(_isReadonly = false, _shallow = false) {
        this._isReadonly = _isReadonly
        this._shallow = _shallow
    }
    // get捕获器为属性读取操作的捕获器，它可以捕获obj.pro、array[index]、array.indexOf()、arr.length、Reflect.get()、
    // Object.create(obj).foo（访问继承者的属性）等操作
    get(target, key, receiver) {
        const isReadonly = this._isReadonly, shallow = this._shallow
        // 下面这些判断主要是用于工具函数的实现比如：isReactive()、isReadonly()、toRaw()等。
        if (key === ReactiveFlags.IS_REACTIVE) {
            return !isReadonly
        } else if (key === ReactiveFlags.IS_READONLY) {
            return isReadonly
        } else if (key === ReactiveFlags.IS_SHALLOW) {
            return shallow
        } else if (key === ReactiveFlags.RAW) {
            /**
             * 在获取原始值时，有一个额外的条件：receiver全等于target的代理对象，这么做是为了避免从原型链上获取不属于自己的原始对象
             * 例子:
             * const parent = { p:1 }
             * const parentReactive = reactive(parent)
             * const child = Object.create(parentReactive)
             * console.log(toRaw(parentReactive) === parent) // true
             * console.log(toRaw(child) === parent) // false
             * 这时parentReactive的原始对象还是parent，这是毫无疑问的
             * 如果尝试获取child的原型对象，因为child本身不存在ReactiveFlags.RAW属性的，会沿着原型链向上寻找
             * 找到parentReactive时，会被parentReactive的get拦截捕获器捕获（此时target是parent、receiver是child），如果没有全等判断
             * 会直接返回target即parent，此时意味着child的原型对象是parent，这显然是不合理的。
             * 
             */
            if (
                receiver ===
                (isReadonly
                    ? shallow
                        ? shallowReadonlyMap
                        : readonlyMap
                    : shallow
                        ? shallowReactiveMap
                        : reactiveMap
                ).get(target) ||
                Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
            ) {
                return target
            }
            return
        }

        const targetIsArray = isArray(target)
        /**
         * 针对于reactive代理对象为数组的情况，主要是重写includes、indexof、lastIndexOf、push、pop、shift、unshift、splice这些方法
         * 首先对于includes、indexof、lastIndexOf的重写原因
         * 例子
         *  const obj = {}
         *  const myArray = reactive([obj])
         *  myArray.includes(obj) // true
         *  当调用includes、indexof、lastIndexOf会遍历myArray，遍历myArray的过程中，由于myArray[i]是一个对象因此会递归的触发执行reactive(res)最后取到的myArray[i]是
         *  reactive方法创建的Proxy对象，如果拿这个对象和obj原始对象进行比较肯定找不到，所以需要特殊处理。
         * 
         * 
         * push、pop、shift、unshift、splice重写的原因
         * 这几个方法的执行都会改变数组的长度，以push为例，ECMAScript对push流程的说明：会先读取数组的length属性，然后再设置length属性。我们知道在属性读取的
         * 过程中会进行依赖收集，属性修改的时候会触发依赖(执行effect.run)。
         * 举一个简单的例子
         * const arr = reactive([])
         * effect(() => {
         *  arr.push(1)
         * })
         * 当向arr进行push操作，首先读取arr.length，将length对应的依赖effect收集起来，由于push操作会设置length，所以在设置length的过程中会触发length
         * 的依赖，执行effect.run()，而在effect.run()中又会执行this.fn()，又会调用arr.push操作，这样就会造成一个死循环。
         */
        if (!isReadonly) {
            // 如果是数组，并且访问的是数组的一些方法，那么返回对应的方法，比如includes、push、pop等
            if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
                return Reflect.get(arrayInstrumentations, key, receiver)
            }
            // 如果访问的是 hasOwnProperty 方法，那么返回 hasOwnProperty 方法
            if (key === 'hasOwnProperty') {
                return hasOwnProperty
            }
        }

        // 获取对象的属性值
        const res = Reflect.get(target, key, receiver)

        // 如果不是只读属性，那么进行依赖收集，由于只读的响应式数据是无法对其进行修改的，所以收集它的依赖是没有用的，只会造成资源的浪费。
        if (!isReadonly) {
            track(target, key)
        }

        // 如果是浅层响应式，返回res
        if (shallow) {
            return res
        }

        // 如果返回是是Ref类型的，对返回值进行解包
        if (isRef(res)) {
            // const books = reactive([ref('Vue 3 Guide')])
            // console.log(books[0].value) // 这里需要 .value
            // 对访问数组的索引不进行解包
            return targetIsArray && isIntegerKey(key) ? res : res.value
        }

        // tip: vue3 懒代理实现方式，默认代理首层属性，访问嵌套属性开始递归处理，从这里可以看出Vue3的Proxy是懒惰式的创建响应对象
        // 只有访问对应的key才会继续创建响应式对象，否则不用创建
        if (isObject(res)) {
            return isReadonly ? readonly(res) : reactive(res)
        }
        return res
    }
}

class MutableReactiveHandler extends BaseReactiveHandler {
    constructor(shallow = false) {
        super(false, shallow)
    }

    /**
     * set 捕获器可以捕获 obj.str=''、arr[0]=1、arr.length=2、Reflect.set()、Object.create(obj).foo = 'foo'（修改继承者的属性）操作
     * @returns 
     */
    set(
        target,
        key,
        value,
        receiver
    ) {
        // 获取旧值
        let oldValue = target[key]
        /**
         * 为什么需要取新值和旧值的原始值
         * 
         * 避免设置属性的过程中造成原始数据的污染
         * const obj1 = {}
         * const obj2 = { a: obj1 }
         * const obj2Reactive = reactive(obj2)
         * 
         * obj2Reactive.a = reactive(obj1)
         * console.log(obj2.a === obj1) // true
         * 如果我们不对value取原始值，在修改obj2Reactive的a属性时，会将响应式对象添加到obj2中，如此原始数据obj2中会被混入响应式数据
         * 原始数据就被污染了，为了避免这种情况，就需要去value的原始值，将value的原始值添加到obj2中。
         * 
         */
        if (!this._shallow) {
            // 旧值是否是只读的
            const isOldValueReadonly = isReadonly(oldValue)
            // 新值不是浅响应式并且不是只读的
            if (!isShallow(value) && !isReadonly(value)) {
                // 获取新值、旧值的原始值
                oldValue = toRaw(oldValue)
                value = toRaw(value)
            }
            // 如果target不是数组并且旧值是ref类型，新值不是ref类型
            if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
                // 旧值是只读的，直接设置失败
                if (isOldValueReadonly) {
                    return false
                } else {
                    // 直接修改旧值.value，触发Ref类型中的依赖收集
                    oldValue.value = value
                    return true
                }
            }
        }

        // 判断key在原始对象中是否存在，存在就是对属性的修改，不存在就是新增属性
        const hadKey =
            isArray(target) && isIntegerKey(key)
                ? Number(key) < target.length
                : hasOwn(target, key)
        // 调用Reflect.set修改属性
        const result = Reflect.set(target, key, value, receiver)
        // 对于处在原型链上的target不触发依赖
        if (target === toRaw(receiver)) {
            if (!hadKey) {
                trigger(target, TriggerOpTypes.ADD, key, value)
            } else if (hasChanged(value, oldValue)) { // 如果是修改操作，比较新旧值
                trigger(target, TriggerOpTypes.SET, key, value, oldValue)
            }
        }
        return result
    }

    // deleteProperty捕获器用来捕获delete obj.str、Reflect.deletedeleteProperty操作
    deleteProperty(target, key) {

        // key是否是target自身的属性
        const hadKey = hasOwn(target, key)
        const oldValue = target[key]
        // 调用Reflect.deleteProperty从target上删除属性
        const result = Reflect.deleteProperty(target, key)
        // 如果删除成功并且target自身有key，则触发依赖
        if (result && hadKey) {
            trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
        }
        return result
    }

    // has捕获器可以捕获for...in...、key in obj、Reflect.has()操作
    has(target, key) {
        const result = Reflect.has(target, key)
        // key不是symbol类型或不是symbol的内置属性，进行依赖收集
        if (!isSymbol(key) || !builtInSymbols.has(key)) {
            track(target, key)
        }
        return result
    }
    // ownKeys捕获器可以捕获Object.keys()、Object.getOwnPropertyNames()、Object.getOwnPropertySymbols()、Reflect.ownKeys()操作
    ownKeys(target) {
        // 如果target是数组，收集length的依赖
        if (isArray(target)) {
            track(target, 'length')
        }
        return Reflect.ownKeys(target)
    }
}

// 对于只读的响应式数据，设置值和删除值都会报错
// 由于被readonly处理的数据不会被修改，所以所有的修改操作都不会被允许，修改操作不会进行意味着也就不会进行依赖的触发，对应地也就不需要进行依赖的收集，
// 所以ownKeys、has也就没必要拦截了
class ReadonlyReactiveHandler extends BaseReactiveHandler {
    constructor(shallow = false) {
        super(true, shallow)
    }

    set(target, key) {
        console.warn(
            `Set operation on key "${String(key)}" failed: target is readonly.`,
            target
        )
        return true
    }

    deleteProperty(target, key) {
        console.warn(
            `Delete operation on key "${String(key)}" failed: target is readonly.`,
            target
        )
        return true
    }
}


export const mutableHandlers = new MutableReactiveHandler()


export const readonlyHandlers = new ReadonlyReactiveHandler()

export const shallowHandlers = new MutableReactiveHandler(true)

export const readonlyShallowHandlers = new ReadonlyReactiveHandler(true)
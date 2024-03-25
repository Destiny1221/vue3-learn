import { extend, isArray, isSymbol, TriggerOpTypes } from "../shared/index.js"
import { createDep, newTracked, wasTracked, initDepMarkers, finalizeDepMarkers } from './dep.js'

let activeEffect

let shouldTrack = true

const trackStack = []

const targetMap = new WeakMap()

let effectTrackDepth = 0

export let trackOpBit = 1

const maxMarkerBits = 30

// 暂停依赖收集
export function pauseTracking() {
    trackStack.push(shouldTrack)
    shouldTrack = false
}

/**
 * Re-enables effect tracking (if it was paused).
 */
export function enableTracking() {
    trackStack.push(shouldTrack)
    shouldTrack = true
}


// 恢复依赖收集
export function resetTracking() {
    const last = trackStack.pop()
    shouldTrack = last === undefined ? true : last
}


/**
 * ReactiveEffect是使用es6 定义的一个类。它的构造器接受三个参数：fn(副作用函数)、scheduler(调度器)、scope(一个EffectScope作用域对象)
 * 在构造器中调用了recordEffectScope方法，该方法将当前的ReactiveEffect对象放入对应的EffectScope作用域中。
 * ReactiveEffect对象有两个方法，run和stop。
 */
export class ReactiveEffect {
    active = true
    deps = []
    parent = undefined

    deferStop
    onStop

    constructor(fn, scheduler, scope) {
        this.fn = fn
        this.scheduler = scheduler
        this.scope = scope
        console.log("创建 ReactiveEffect 对象");
    }

    run() {
        // 如果当前 ReactiveEffect 对象不处于活动状态，直接返回 fn 的执行结果
        if (!this.active) {
            return this.fn()
        }
        // 寻找当前 ReactiveEffect 对象的最顶层的父级作用域
        let parent = activeEffect
        let lastShouldTrack = shouldTrack
        while (parent) {
            if (parent === this) {
                return
            }
            parent = parent.parent
        }
        try {
            // 设置当前的parent为上一个activeEffect
            this.parent = activeEffect
            // 设置activeEffect为当前ReactiveEffect实例，activeEffect是个全局变量
            activeEffect = this
            // 修改全局变量 shouldTrack 的值为 true （表示是否需要收集依赖）
            shouldTrack = true
            // tip：上述的操作是为了建立一个嵌套的effect的关系

            // effectTrackDepth是一个全局变量，用于标识当前的 effect 调用栈的深度，每执行一次effect()就会+1
            // trackOpBit是使用二进制标记依赖收集的状态
            trackOpBit = 1 << ++effectTrackDepth
            // 这里是用于控制 "effect调用栈的深度" 在一个阈值之内
            if (effectTrackDepth <= maxMarkerBits) {
                // 初始依赖追踪标记，将this.deps中的所有dep标记为track状态
                /**
                 * 这里为什么要对dep进行标记？
                 * 原因一：避免对重复收集过的依赖进行再次收集
                 * const counter = reactive({num1:1,num2:2})
                 * effect(()=>{console.log(counter.num1+counter.num1+counter.num2)})
                 * 该例子会经历3次依赖收集，当第二次访问counter.num1时，由于对该key已经进行过依赖收集了，因此此时
                 * 不应该依赖收集，主要判断逻辑是通过trackEffects函数判断的
                 * 
                 * 原因二: 移除多余的依赖
                 * const obj = reactive({ str: 'objStr', flag: true })
                 * effect(() => {
                 *  const c = obj.flag ? obj.str : 'no found'
                 *  console.log(c)
                 * })
                 * obj.flag = false
                 * obj.str = 'test'
                 * 
                 * 在首次track(依赖更新)时，会触发flag的set拦截器，此时打印no found，在第二次track时，会触发
                 * str的set拦截器，但是由于副作用函数在obj.flag为false时此时函数的执行结果不会收obj.str的影响。
                 * 因此无论obj.str如何变化都不会触发依赖更新。此时就是dep中的标记的作用将该dep标记为已收集但未使用
                 * 的无效依赖，会在最终finalizeDepMarkers中删除该依赖。
                 */
                initDepMarkers(this)
            } else {
                // 清除所有的依赖追踪标记，移除deps中的所有dep
                cleanupEffect(this)
            }

            // 执行副作用函数，此时会进行依赖收集
            return this.fn()
        } finally {
            // 副作用函数执行完毕之后恢复一些状态

            if (effectTrackDepth <= maxMarkerBits) {
                // dep标记恢复，冗余依赖删除，依赖标识重置
                finalizeDepMarkers(this)
            }

            // 执行完毕会将 effectTrackDepth 减 1
            trackOpBit = 1 << --effectTrackDepth

            // 执行完毕，将当前活动的 ReactiveEffect 对象设置为 “父级作用域”
            activeEffect = this.parent
            // 将 shouldTrack 设置为上一个值
            shouldTrack = lastShouldTrack
            // 将parent属性设置为 undefined
            this.parent = undefined

            if (this.deferStop) {
                this.stop()
            }
        }
    }
    // 调用stop方法后，ReactiveEffect对象就不会再依赖收集了
    stop() {
        // 如果当前 活动的 ReactiveEffect 对象是 “自己”
        // 延迟停止，需要执行完当前的副作用函数之后再停止
        if (activeEffect === this) {
            this.deferStop = true
        } else if (this.active) {
            // 如果当前 ReactiveEffect 对象处于活动状态
            // 清除所有的依赖追踪标记
            cleanupEffect(this)
            // 如果有 onStop 回调函数，就执行
            if (this.onStop) {
                this.onStop()
            }
            this.active = false
        }
    }
}

/**
 * 
 * @param {*} effect ReactiveEffect
 */
function cleanupEffect(effect) {
    const { deps } = effect
    if (deps.length) {
        for (let i = 0; i < deps.length; i++) {
            deps[i].delete(effect)
        }
        deps.length = 0
    }
}

/**
 * effect的作用就是将我们注册的副作用函数暂存，在依赖的数据发生变化的时候执行
 * 接受两个参数，一个是副作用函数，一个是一个可选的options对象
 * 该对象具有以下属性：
 * lazy:boolean 是否是懒加载，如果是true，那么调用effect函数不会立即执行，需要用户手动执行
 * scheduler: 一个调度函数，如果存在调度函数，在触发依赖时，执行该调度函数
 * scope: 一个EffectScope作用域对象
 * allowRecurse: boolean 是否允许递归
 * onStop: effect被停止时的钩子函数
 * @param {*} fn 
 * @param {*} options 
 * @returns 
 */
export function effect(fn, options) {
    /**
     * 首先检查fn.effect属性，如果存在，说明fn已经被effect处理过了，然后使用fn.effect.fn作为fn
     * 
     * const fn = () => {}
     * const runner1 = effect(fn)
     * const runner2 = effect(runner1)
     * runner1.effect.fn === fn // true
     * runner2.effect.fn === fn // true
     */
    if (fn.effect instanceof ReactiveEffect) {
        fn = fn.effect.fn
    }
    // 创建ReactiveEffect对象，即响应式副作用对象
    const _effect = new ReactiveEffect(fn)
    // 如果有配置项，就合并到_effect对象中
    if (options) {
        extend(_effect, options)
        // 如果配置项中有 scope 属性（该属性的作用是指定副作用函数的作用域），那么就将 scope 属性记录到响应式副作用函数上（类似一个作用域链）
        // if (options.scope) recordEffectScope(_effect, options.scope)
    }
    // 不存在options或者options.lazy不为true，则执行_effect.run()进行依赖收集
    if (!options || !options.lazy) {
        _effect.run()
    }
    // 将_effect.run中的this指向它本身，这样做的目的是用户在主动执行runner时，this指向正确，然后将_effect作为
    // runner的effect属性，并将runner返回
    const runner = _effect.run.bind(_effect);
    runner.effect = _effect;
    return runner;
}

export function isTracking() {
    return shouldTrack && activeEffect
}

// 依赖收集入口，其结构是一个WeakMap结构，其中targetMap保存着所有响应式数据所对应
// 的副作用函数。targetMap的键为响应式数据的原始对象，值是一个Map，而Map的键是原始
// 对象的key，值是一个由副作用函数（一个ReactiveEffect实例）组成的Set集合
// targetMap使用WeakMap结构，因为WeakMap的键是弱引用，当target对象被销毁后，它对应的Map也会被垃圾回收
export function track(object, key) {
    console.log('依赖收集')
    if (isTracking()) {
        let depsMap = targetMap.get(object)
        if (!depsMap) {
            targetMap.set(object, depsMap = new Map())
        }
        let dep = depsMap.get(key)
        if (!dep) {
            depsMap.set(key, dep = createDep())
        }
        trackEffects(dep)
    }
}

/**
 * @param {*} dep Dep
 * 
 * 这里重要的是shouldTrack的值是如何确定的，该函数决定该依赖是否要被收集
 * 这里就是重复依赖不收集的关键点
 * shouldTrack的确定和dep的n、w属性密切相关。
 * 如果newTracked(dep) === true，说明在本次run方法执行过程中，dep已经被收集过了，shouldTrack不变；
 * 如果newTracked(dep) === false，要把dep标记为新收集的，虽然dep在本次收集过程中是新收集的，
 * 但它可能在之前的收集过程中已经被收集了，所以shouldTrack的值取决于dep是否在之前已经被收集过了
 */
export function trackEffects(dep) {
    // 先声明了一个默认值为false的shouldTrack变量，代表我们不需要收集activeEffect
    let shouldTrack = false
    if (effectTrackDepth <= maxMarkerBits) {
        // tip: 这里有点误导人，newTracked返回false表示是本次依赖收集中新收集到的dep
        if (!newTracked(dep)) {
            // 修改dep的n属性
            dep.n |= trackOpBit // set newly tracked
            // wasTracked 用来判断当前的依赖是否已经被追踪过了
            shouldTrack = !wasTracked(dep)
        }
    } else {
        // 已经到了最大的依赖收集深度，这里就不再对相同的依赖进行收集了
        shouldTrack = !dep.has(activeEffect)
    }
    if (shouldTrack) {
        // 双向添加
        // 在dep中添加 ReactiveEffect 对象
        dep.add(activeEffect)
        // 在 ReactiveEffect 对象的dep数组中添加dep
        activeEffect.deps.push(dep)
    }
}

/**
 * 当依赖被收集后，一旦响应式数据的某些属性改变后，就会触发对应的依赖，这个触发的过程发生在
 * proxy的set、deleteProperty拦截器中
 * @param {*} object 
 * @param {*} type TriggerOpTypes
 * @param {*} key 
 * @returns 
 */
export function trigger(object, type, key, newValue, oldValue) {
    console.log('触发依赖更新')
    // 获取target对相应的所有依赖，一个map对象 
    const depsMap = targetMap.get(object)
    // 没有直接return
    if (!depsMap) {
        return
    }
    // 创建一个数组，用来存放需要执行的 ReactiveEffect 对象
    let deps = []
    if (type === TriggerOpTypes.CLEAR) {
        // 进入这个分支意味着调用(map/set).clear()，map或者set被清空了，这时候与map/set相关的所有依赖都要被触发
        deps = [...depsMap.values()]
    } else if (key === 'length' && isArray(target)) {
        /**
         * 当操作的是arr的length属性，如arr.length = 1，这时要获取的依赖包括
         * length属性以及索引大于等于新的length的依赖
         * 
         * 例子:
         *  const arr = reactive([1,2])
         *  effect(()=>console.log(arr[1]))
         *  arr.length = 0
         *  此时key是1,newLength是0，收集依赖触发更新，打印undefined
         * 
         *  arr.length = 4时，由于数组长度变化，但是arr[1]得值并没有变化因此不需要触发这个依赖更新
         *  */
        const newLength = Number(newValue)
        depsMap.forEach((dep, key) => {
            if (key === 'length' || (!isSymbol(key) && key >= newLength)) {
                deps.push(dep)
            }
        })
    } else {
        // key 不是 undefined，就会将 depsMap 中 key 对应的 ReactiveEffect 对象添加到 deps 中
        // void 0 就是 undefined
        // schedule runs for SET | ADD | DELETE
        if (key !== void 0) {
            deps.push(depsMap.get(key))
        }
        // 执行一些有关集合类型的操作，我们就不详细介绍了
    }

    // 上面使用depMaps.get()可能会返回undefined，因此在下面需要有一个判断是否存在的判断条件
    // 如果 deps 的长度为 1，就会直接执行
    if (deps.length === 1) {
        if (deps[0]) {
            triggerEffects(deps[0])
        }
    } else {
        // 如果 deps 的长度大于1，遍历deps并解构，将每一个effect放入effects，然后在调用triggerEffects时，
        // 利用set去重
        const effects = []
        for (const dep of deps) {
            if (dep) {
                effects.push(...dep)
            }
        }
        triggerEffects(createDep(effects))
    }
}

/**
 * 
 * @param {*} dep  Dep | ReactiveEffect[]
 */
export function triggerEffects(dep) {
    // 如果 dep 不是数组，就会将 dep 转换成数组，因为这里的 dep 可能是一个 Set 集合(当上一步trigger中的deps length为1的情况)
    // spread into array for stabilization
    const effects = isArray(dep) ? dep : [...dep]
    for (const effect of effects) {
        // 执行 computed 依赖
        if (effect.computed) {
            triggerEffect(effect)
        }
    }
    // 执行其他依赖
    for (const effect of effects) {
        if (!effect.computed) {
            triggerEffect(effect)
        }
    }
}

/**
 * 
 * @param {*} effect ReactiveEffect
 */
export function triggerEffect(effect) {
    // 如果 effect 不是 activeEffect，或者 effect 允许递归，就会执行
    if (effect !== activeEffect || effect.allowRecurse) {
        // 如果 effect 是一个调度器，就会执行 scheduler ，可以让用户自己选择调用的时机
        if (effect.scheduler) {
            // scheduler 可以让用户自己选择调用的时机
            // 这样就可以灵活的控制调用了
            // 在 runtime-core 中，就是使用了 scheduler 实现了在 next ticker 中调用的逻辑
            effect.scheduler()
        } else {
            // 否则直接执行 effect.run()
            effect.run()
        }
    }
}
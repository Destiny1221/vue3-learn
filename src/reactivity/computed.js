import { isFunction } from '../shared/index.js'
import { ReactiveEffect } from './effect.js'
import { ReactiveFlags, toRaw } from './reactive.js'
import { trackRefValue, triggerRefValue } from './ref.js'


export class ComputedRefImpl {
    // 依赖
    dep
    // 缓存的值
    _value
    // 在构造器中创建的ReactiveEffect实例
    effect
    // computed实现缓存的核心，利用_dirty标志位标识响应式对象的值是否发生改变
    _dirty = true
    // 标志位，表示是一个Ref类型
    __v_isRef = true
    // 只读标识
    // [ReactiveFlags.IS_READONLY] = false
    constructor(getter, setter, isReadonly, isSSR) {
        this._getter = getter
        this._setter = setter
        // 在构造器中声明了一个ReactiveEffect，并将getter和调度函数作为参数传入，在调度器中
        // 如果_dirty为false，会重置_dirty的值，并执行triggerRefValue函数
        // 只要触发了这个函数说明响应式对象的值发生改变了，那么就解锁，后续在调用get的时候就会重新执行，所以会得到最新的值
        this.effect = new ReactiveEffect(getter, () => {
            if (!this._dirty) {
                this._dirty = true
                triggerRefValue(this)
            }
        })
        // this.effect.computed指向this
        this.effect.computed = this
        // this.effect.active在SSR中为false
        this.effect.active = !isSSR
        this[ReactiveFlags.IS_READONLY] = isReadonly
    }
    get value() {
        // computed可能被其他proxy包裹，如readonly(computed(() => foo.bar))，所以要获取this的原始对象
        const self = toRaw(this)
        // 收集依赖
        trackRefValue(self)
        // 加锁
        // 当数据改变的时候才会解锁
        // 这里就是缓存实现的核心
        // 解锁是在 scheduler 里面做的
        if (self._dirty) {
            self._dirty = false
            // 执行用户传入的getter函数，获取返回值
            self._value = self.effect.run()
        }
        return this._value
    }

    // 当修改value属性时，会调用实例的_setter函数
    set value(newVal) {
        this._setter(newVal)
    }
}

/**
 * computed接受一个getterOrOptions参数，该参数有两种类型，一种是getter函数，一种是一个包含
 * get、set的对象
 * @param {*} getterOrOptions 
 * @returns 
 */
export function computed(getterOrOptions, isSSR = false) {
    // 首先从getterOrOptions中确定getter、setter（如果getterOrOptions是个function，说明computed是不可写的，所以会将setter设置为一个空函数）
    const onlyGetter = isFunction(getterOrOptions)
    let getter, setter
    if (onlyGetter) {
        getter = getterOrOptions
        // 如果是只读的，那么设置setter函数，需要有相关提示
        setter = function () {
            console.warn('computed value is readonly')
        }
    } else {
        // 将用户传入的get、set函数赋予变量getter、setter
        getter = getterOrOptions.get
        setter = getterOrOptions.set
    }
    // 创建一个ComputedRefImpl实例，并将其返回
    return new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR)
}
import { isFunction } from '../shared/index.js'
import { ReactiveEffect } from './effect.js'


export class ComputedRefImpl {
    _value
    effect
    _dirty = true
    __v_isRef = true
    constructor(getter, setter) {
        this._getter = getter
        this._setter = setter
        this.effect = new ReactiveEffect(getter, () => {
            if (!this._dirty) {
                this._dirty = true
            }
        })
        this.effect.computed = this
    }
    get value() {
        if (this._dirty) {
            this._dirty = false
            this._value = this.effect.run()
        }
        return this._value
    }
    set value(newVal) {
        this._setter(newVal)
    }
}

export function computed(getterOrOptions) {
    const onlyGetter = isFunction(getterOrOptions)
    let getter, setter
    if (onlyGetter) {
        getter = getterOrOptions
        setter = function () {
            console.warn('computed value is readonly')
        }
    } else {
        getter = getterOrOptions.get
        setter = getterOrOptions.set
    }
    return new ComputedRefImpl(getter, setter)
}
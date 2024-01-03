
import { isObject, isArray, isIntegerKey, hasOwn, hasChanged } from "../shared/index.js"
import { readonly, reactive, reactiveMap, shallowReactiveMap, readonlyMap, shallowReadonlyMap, ReactiveFlags } from "./reactive.js"
import { track, trigger } from './effect.js'

const get$1 = createGetter()
const set = createSetter()
const get$2 = createGetter(true)
const get$3 = createGetter(false, true)
const get$4 = createGetter(true, true)

function createGetter(isReadonly = false, isShallow = false) {
    return function get(target, key, receiver) {
        if (key === ReactiveFlags.IS_REACTIVE) {
            return !isReadonly
        } else if (key === ReactiveFlags.IS_READONLY) {
            return isReadonly
        } else if (key === ReactiveFlags.IS_SHALLOW) {
            return isShallow
        } else if (key === ReactiveFlags.RAW) {
            if (
                receiver ===
                (isReadonly
                    ? isShallow
                        ? shallowReadonlyMap
                        : readonlyMap
                    : isShallow
                        ? shallowReactiveMap
                        : reactiveMap
                ).get(target) ||
                // receiver is not the reactive proxy, but has the same prototype
                // this means the reciever is a user proxy of the reactive proxy
                Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
            ) {
                return target
            }
            return
        }

        const res = Reflect.get(target, key, receiver)
        if (isShallow) {
            return res
        }
        if (!isReadonly) {
            track(target, key)
        }
        // vuu3 懒代理实现方式，默认代理首层属性，访问嵌套属性开始递归处理
        if (isObject(res)) {
            return isReadonly ? readonly(res) : reactive(res)
        }
        return res
    }
}


function createSetter() {
    return function set(target, key, value, receiver) {
        const oldValue = target[key]
        const hadKey =
            isArray(target) && isIntegerKey(key)
                ? Number(key) < target.length
                : hasOwn(target, key)
        const res = Reflect.set(target, key, value, receiver)
        if (!hadKey) {
            // console.log(`属性新增：${key},${value}`)
            trigger(target, key)
        } else if (hasChanged(value, oldValue)) {
            // console.log(`属性修改：${key},${value}`)
            trigger(target, key)
        }
        return res
    }
}

export const mutableHandlers = {
    get: get$1,
    set: set
}


export const readonlyHandlers = {
    get: get$2,
    set: function (target, key) {
        console.warn(
            `Set operation on key "${String(key)}" failed: target is readonly.`,
            target
        )
        return true
    }
}

export const shallowHandlers = {
    get: get$3,
    set: set
}

export const readonlyShallowHandlers = {
    get: get$4,
    set: function (target, key) {
        console.warn(
            `Set operation on key "${String(key)}" failed: target is readonly.`,
            target
        )
        return true
    }
}
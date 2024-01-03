import { isObject } from '../shared/index.js'
import { mutableHandlers, readonlyHandlers, shallowHandlers, readonlyShallowHandlers } from './baseHandlers.js'

export const ReactiveFlags = {
    SKIP: '__v_skip',
    IS_REACTIVE: '__v_isReactive',
    IS_READONLY: '__v_isReadonly',
    IS_SHALLOW: '__v_isShallow',
    RAW: '__v_raw'
}

export const reactiveMap = new WeakMap()
export const shallowReactiveMap = new WeakMap()
export const readonlyMap = new WeakMap()
export const shallowReadonlyMap = new WeakMap()

export function reactive(target) {
    return createReactiveObject(target, mutableHandlers, reactiveMap)
}

export function shallowReactive(target) {
    return createReactiveObject(target, shallowHandlers, shallowReactiveMap)
}

export function readonly(target) {
    return createReactiveObject(target, readonlyHandlers, readonlyMap)
}

export function shallowReadonly(target) {
    return createReactiveObject(target, readonlyShallowHandlers, shallowReadonlyMap)
}

// 核心就是使用proxy代理，使用工厂模式创建，主要还是关注各自里面的handlers
function createReactiveObject(target, handlers, proxyMap) {
    if (!isObject) return target
    // 缓存优化
    const existingProxy = proxyMap.get(target)
    if (existingProxy) {
        return existingProxy
    }
    const proxy = new Proxy(target, handlers)
    proxyMap.set(target, proxy)
    return proxy
}

export function isReactive(value) {
    if (isReadonly(value)) {
      return isReactive(value[ReactiveFlags.RAW])
    }
    return !!(value && value[ReactiveFlags.IS_REACTIVE])
  }

export function isReadonly(value) {
    return !!(value && value[ReactiveFlags.IS_READONLY])
}

export function isShallow(value) {
    return !!(value && value[ReactiveFlags.IS_SHALLOW])
}

export function toRaw(value) {
    const raw = value && value[ReactiveFlags.RAW]
    return raw ? toRaw(raw) : value
}

export function toReactive(value) {
    return isObject(value) ? reactive(value) : value
}
import { isObject, toRawType, def } from '../shared/index.js'
import { mutableHandlers, readonlyHandlers, shallowHandlers, readonlyShallowHandlers } from './baseHandlers.js'

export const ReactiveFlags = {
    SKIP: '__v_skip',
    IS_REACTIVE: '__v_isReactive',
    IS_READONLY: '__v_isReadonly',
    IS_SHALLOW: '__v_isShallow',
    RAW: '__v_raw'
}

const TargetType = {
    'INVALID': 0,
    'COMMON': 1,
    'COLLECTION': 2
}

function targetTypeMap(rawType) {
    switch (rawType) {
        case 'Object':
        case 'Array':
            return TargetType.COMMON
        case 'Map':
        case 'Set':
        case 'WeakMap':
        case 'WeakSet':
            return TargetType.COLLECTION
        default:
            return TargetType.INVALID
    }
}

/**
 * 
 * @param {*} value 
 * @returns 
 * 有三种可能的返回结果：
 *  TargetType.INVALID：代表target不能被代理
 *  TargetType.COMMON：代表target是Array或Object
 *  TargetType.COLLECTION：代表target是Map、Set、WeakMap、WeakSet中的一种
 * 
 * target不能被代理的情况有三种
 *  显示声明对象不可代理(通过向对象添加__v_skip:true)属性或使用markRaw标记的对象
 *  对象为不可扩展对象：如通过Object.freeze、Object.seal、Object.preventExtensions的对象
 *  除了Object、Array、Map、Set、WeakMap、WeakSet之外的其他类型的对象，如Date、RegExp、Promise等
 */
function getTargetType(value) {
    // markRaw方法会给对象设置ReactiveFlags.SKIP，表示该对象不可代理，Object.isExtensible是一个静态方法用于判断对象是否可扩展，
    // 可以使用 Object.preventExtensions()、Object.seal()、Object.freeze() 或 Reflect.preventExtensions() 中的任一方法将对象标记为不可扩展
    return value[ReactiveFlags.SKIP] || !Object.isExtensible(value)
        ? TargetType.INVALID
        : targetTypeMap(toRawType(value))
}

export const reactiveMap = new WeakMap()
export const shallowReactiveMap = new WeakMap()
export const readonlyMap = new WeakMap()
export const shallowReadonlyMap = new WeakMap()

export function reactive(target) {
    // 如果观察一个只读的对象，返回该对象本身
    if (isReadonly(target)) {
        return target
    }
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
    // 如果不是一个对象直接返回本身
    if (!isObject) return target
    // 缓存优化：一方面为了避免对同一个对象进行多次代理造成的资源浪费，另一方面可以保证相同对象被代理多次后，代理对象保持一致
    /**
     * const obj = {}
     * const objReactive = reactive([obj])
     * console.log(objReactive.includes(objReactive[0]))
     */
    const existingProxy = proxyMap.get(target)
    if (existingProxy) {
        return existingProxy
    }
    const targetType = getTargetType(target)
    // 不可扩展对象直接返回本身
    if (targetType === TargetType.INVALID) {
        return target
    }
    const proxy = new Proxy(target, handlers)
    proxyMap.set(target, proxy)
    return proxy
}

/**
 * 如果value是只读的，那么就对value的ReactiveFlags.RAW属性继续调用isReactive；
 * 否则根据value的ReactiveFlags.IS_REACTIVE属性判断是否为reactive
 * @param {*} value 
 * @returns 
 */
export function isReactive(value) {
    if (isReadonly(value)) {
        return isReactive(value[ReactiveFlags.RAW])
    }
    return !!(value && value[ReactiveFlags.IS_REACTIVE])
}

// 通过value的ReactiveFlags.IS_READONLY属性判断是否只读
export function isReadonly(value) {
    return !!(value && value[ReactiveFlags.IS_READONLY])
}

export function isShallow(value) {
    return !!(value && value[ReactiveFlags.IS_SHALLOW])
}

/**
 * 获取传入对象的原始对象
 * value的ReactiveFlags.RAW属性可以返回对象的原始对象，但这个原始对象有可能也是可以响应式对象（如readonly(reactive(obj))），
 * 所以递归调用toRaw，以获取真正的原始对象
 * @param {*} value 
 * @returns 
 */
export function toRaw(value) {
    const raw = value && value[ReactiveFlags.RAW]
    return raw ? toRaw(raw) : value
}

// 将对象标记为永远不能转为reactive对象,就是通过Object.defineProperty将value的ReactiveFlags.SKIP（不会被遍历）属性标记为true
export function markRaw(value) {
    def(value, ReactiveFlags.SKIP, true)
    return value
}

export function toReactive(value) {
    return isObject(value) ? reactive(value) : value
}

export function toReadonly(value) {
    return isObject(value) ? readonly(value) : value
}

// isProxy是用来判断value是否为reactive或readonly，并不是用来判断value是proxy类型的
export function isProxy(value) {
    return isReactive(value) || isReadonly(value)
}
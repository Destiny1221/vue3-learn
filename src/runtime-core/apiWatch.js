import { isRef, isShallow, isReactive, ReactiveFlags, ReactiveEffect } from '../reactivity/index.js'
import { isFunction, isArray, isObject, isMap, isPlainObject, isSet, NOOP, hasChanged, remove } from '../shared/index.js'
import { queueJob } from './scheduler.js'
import { callWithErrorHandling, callWithAsyncErrorHandling } from './errorHandling.js'

const INITIAL_WATCHER_VALUE = {}

// Simple effect.
export function watchEffect(
    effect,
    options
) {
    return doWatch(effect, null, options)
}

export function watchPostEffect(
    effect
) {
    return doWatch(effect, null, { flush: 'post' })
}

export function watchSyncEffect(
    effect
) {
    return doWatch(effect, null, { flush: 'sync' })
}

/**
 * watch接受三个参数: source监听源、cb回调函数、options监听配置，watch函数返回一个停止监听函数
 * @param {*} source 
 * @param {*} cb 
 * @param {*} param2 
 * @returns 
 */
export function watch(
    source,
    cb,
    options
) {
    return doWatch(source, cb, options)
}

// watch、watchEffect、watchPostEffect、watchSyncEffect内部都使用这个函数，主要区别就是针对options中的flush处理不同
function doWatch(
    source,
    cb,
    { immediate, deep, flush } = {}
) {

    const warnInvalidSource = (s) => {
        console.warn(
            `Invalid watch source: `,
            s,
            `A watch source can only be a getter/effect function, a ref, ` +
            `a reactive object, or an array of these types.`
        )
    }

    // 声明了一些变量

    // 当前组件实例
    // const instance =
    //     getCurrentScope() === currentInstance?.scope ? currentInstance : null
    const instance = null
    // 副作用函数，在初始化effect时使用，执行getter函数就会访问响应式数据触发依赖收集
    let getter
    // 强制触发监听
    let forceTrigger = false
    // 是否为多数据源
    let isMultiSource = false

    // 根据传入的source确定getter、forceTrigger、isMultiSource具体值。
    if (isRef(source)) {
        getter = () => source.value
        forceTrigger = isShallow(source)
    } else if (isReactive(source)) {
        // source是reactive类型，将deep设置为true
        getter = () => source
        deep = true
    } else if (isArray(source)) {
        // 如果source是个数组，将isMultiSource设置为true，forceTrigger取决于source中是否有
        // reactive类型的数据或者shallow类型的数据
        isMultiSource = true
        forceTrigger = source.some(s => isReactive(s) || isShallow(s))
        // getter 函数中会遍历source，针对不同类型做不同的处理
        getter = () =>
            source.map(s => {
                if (isRef(s)) {
                    return s.value
                } else if (isReactive(s)) {
                    return traverse(s)
                } else if (isFunction(s)) {
                    return callWithErrorHandling(s, instance)
                } else {
                    warnInvalidSource(s)
                }
            })
    } else if (isFunction(source)) {
        // 存在cb，说明是执行的是watch API，执行source函数，我们将source函数放在callWithErrorHandling函数中
        // 执行，callWithErrorHandling会处理source执行过程中出现的错误
        if (cb) {
            // getter with cb
            getter = () =>
                callWithErrorHandling(source, instance)
        } else {
            // 不存在cb，说明是执行watchEffect、watchPostEffect、watchSyncEffect这些API
            // no cb -> simple effect
            getter = () => {
                // 如果组件实例已经卸载，直接return
                if (instance && instance.isUnmounted) {
                    return
                }
                /**
                 * 如果存在cleanup清理函数，执行清理函数
                 * cleanup是在 watchEffect 中注册的清理函数，具体形式见官网
                 */
                if (cleanup) {
                    cleanup()
                }
                // 执行source函数，使用callWithAsyncErrorHandling函数包装，与callWithErrorHandling相同的是处理
                // source执行过程中的错误，不同的是会异步处理错误，传入onCleanup，用来注册清理函数
                return callWithAsyncErrorHandling(
                    source,
                    instance,
                    [onCleanup]
                )
            }
        }
    } else {
        // 其他情况，说明source是个错误类型给出提示
        getter = NOOP
        warnInvalidSource(source)
    }

    // 对Vue2的数组进行兼容性处理
    // .......

    // 如果存在cb并且deep为true，需要对数据进行深度监听(对getter重新赋值，即使用递归函数，递归访问之前getter的返回结果)
    if (cb && deep) {
        const baseGetter = getter
        getter = () => traverse(baseGetter())
    }
    // 至此，getter函数会尽可能访问响应式数据(针对于deep为true的情况会调用traverse完成对source的递归属性访问)

    let cleanup
    let onCleanup = (fn) => {
        cleanup = effect.onStop = () => {
            callWithErrorHandling(fn, instance)
            cleanup = effect.onStop = undefined
        }
    }

    // 声明oldValue，如果是多数据源是个数组，否则是个对象
    let oldValue = isMultiSource
        ? new Array((source).length).fill(INITIAL_WATCHER_VALUE)
        : INITIAL_WATCHER_VALUE

    /**
     * 创建一个job函数：作用是触发cb(watch)或者执行effect.run(watchEffect)。
     * @returns 
     */
    const job = () => {
        // 如果effect未激活直接return
        if (!effect.active) {
            return
        }
        // 执行watch API中用户传入的函数
        if (cb) {
            // watch(source, cb)
            // 调用effect.run获取最新响应式数据最新值
            const newValue = effect.run()

            // 执行cb函数，这里出发cb需要满足以下条件任意一个条件即可
            /**
             * 1.深度监听
             * 2.强制触发
             * 3.如果多数据源，newValue中存在与oldValue中的值不相同的项（利用Object.is判断）；如果不是多数据源，newValue与oldValue不相同
             */
            if (
                deep ||
                forceTrigger ||
                (isMultiSource
                    ? (newValue).some((v, i) => hasChanged(v, oldValue[i]))
                    : hasChanged(newValue, oldValue))
            ) {
                // cleanup before running cb again
                if (cleanup) {
                    cleanup()
                }
                callWithAsyncErrorHandling(cb, instance, [
                    newValue,
                    // 如果oldValue为INITIAL_WATCHER_VALUE，说明是第一次watch，那么oldValue是undefined
                    oldValue === INITIAL_WATCHER_VALUE
                        ? undefined
                        : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE
                            ? []
                            : oldValue,
                    onCleanup
                ])
                // 修改oldValue的值，为下次执行cb做准备
                oldValue = newValue
            }
        } else {
            // 如果不存在cb，直接调用effect.run
            // watchEffect
            effect.run()
        }
    }

    // important: mark the job as a watcher callback so that scheduler knows
    // it is allowed to self-trigger (#1727)
    job.allowRecurse = !!cb

    // 声明了一个调度器scheduler，在scheduler中会根据flush的不同决定job的触发时机
    let scheduler
    if (flush === 'sync') {
        // 同步侦听器，每当检测到响应式数据发生变化时就会触发。如果执行多次同步修改数据，会不停的触发job函数，因此会存在性能问题，谨慎使用。
        scheduler = job
    } else if (flush === 'post') {
        // 延迟执行，将job添加到一个延迟队列，这个队列会在组件挂在后、更新的生命周期中执行，主要用于在侦听器回调中能够访问被Vue更新之后的所属组件的DOM。
        // scheduler = () => queuePostRenderEffect(job, instance && instance.suspense)
    } else {
        // 默认 pre，将job添加到一个优先执行队列，该队列会在挂载前执行。即默认情况下我们在侦听器回调中访问所属组件的DOM，那么DOM将处于更新之前的状态。
        // default: 'pre'
        job.pre = true
        if (instance) job.id = instance.uid
        scheduler = () => queueJob(job)
    }

    // 创建effect实例
    const effect = new ReactiveEffect(getter, scheduler)

    // 首次执行副作用函数
    if (cb) {
        // 如果是immediate为true，执行job，触发cb
        if (immediate) {
            job()
        } else {
            // 执行effect.run()进行依赖收集，并将结果赋值给oldValue
            oldValue = effect.run()
        }
    } else if (flush === 'post') {
        // 将执行结果推入一个延迟队列中
        // queuePostRenderEffect(
        //     effect.run.bind(effect),
        //     instance && instance.suspense
        // )
    } else {
        //  watchEffect，执行effect.run()进行依赖收集
        effect.run()
    }

    // 返回一个函数，该函数用于停止watch对数据源的监听。在函数内部调用effect.stop()将effect置为失活状态
    // 如果存在组件实例，并且组件实例中存在effectScope，那么需要将effect从effectScope中移除。
    const unwatch = () => {
        effect.stop()
        if (instance && instance.scope) {
            remove(instance.scope.effects, effect)
        }
    }

    return unwatch
}

// 递归遍历所有属性，seen用于防止循环引用问题
export function traverse(value, seen) {
    // 如果value不是对象或value不可被转为代理（经过markRaw处理），直接return value
    if (!isObject(value) || value[ReactiveFlags.SKIP]) {
        return value
    }

    // sean用于暂存访问过的属性，防止出现循环引用的问题
    // 如：
    // const obj = { a: 1 }
    // obj.b = obj
    seen = seen || new Set()
    // 如果seen中已经存在了value，意味着value中存在循环引用的情况，这时return value
    if (seen.has(value)) {
        return value
    }
    // 添加value到seen中
    seen.add(value)
    // 如果是ref，递归访问value.value
    if (isRef(value)) {
        traverse(value.value, seen)
    } else if (isArray(value)) {
        // 如果是数组，遍历数组并调用traverse递归访问元素内的属性
        for (let i = 0; i < value.length; i++) {
            traverse(value[i], seen)
        }
    } else if (isSet(value) || isMap(value)) {
        // 如果是Set或Map，调用traverse递归访问集合中的值
        value.forEach((v) => {
            traverse(v, seen)
        })
    } else if (isPlainObject(value)) {
        // 如果是原始对象，调用traverse递归访问value中的属性
        for (const key in value) {
            traverse(value[key], seen)
        }
    }
    return value
}
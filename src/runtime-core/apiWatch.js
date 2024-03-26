import { isRef, isShallow, isReactive, ReactiveFlags, ReactiveEffect } from '../reactivity/index.js'
import { isFunction, isArray, isObject, isMap, isPlainObject, isSet, NOOP, hasChanged } from '../shared/index.js'
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

export function watch(
    source,
    cb,
    options
) {
    return doWatch(source, cb, options)
}

function doWatch(
    source,
    cb,
    { immediate, deep, flush, onTrack, onTrigger } = {}
) {

    const warnInvalidSource = (s) => {
        warn(
            `Invalid watch source: `,
            s,
            `A watch source can only be a getter/effect function, a ref, ` +
            `a reactive object, or an array of these types.`
        )
    }

    // const instance =
    //     getCurrentScope() === currentInstance?.scope ? currentInstance : null
    const instance = null
    let getter
    let forceTrigger = false
    let isMultiSource = false

    if (isRef(source)) {
        getter = () => source.value
        forceTrigger = isShallow(source)
    } else if (isReactive(source)) {
        getter = () => source
        deep = true
    } else if (isArray(source)) {
        isMultiSource = true
        forceTrigger = source.some(s => isReactive(s) || isShallow(s))
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
        if (cb) {
            // getter with cb
            getter = () =>
                callWithErrorHandling(source, instance)
        } else {
            // no cb -> simple effect
            getter = () => {
                if (instance && instance.isUnmounted) {
                    return
                }
                if (cleanup) {
                    cleanup()
                }
                return callWithAsyncErrorHandling(
                    source,
                    instance,
                    [onCleanup]
                )
            }
        }
    } else {
        getter = NOOP
        warnInvalidSource(source)
    }

    if (cb && deep) {
        const baseGetter = getter
        getter = () => traverse(baseGetter())
    }

    let cleanup
    let onCleanup = (fn) => {
        cleanup = effect.onStop = () => {
            callWithErrorHandling(fn, instance)
            cleanup = effect.onStop = undefined
        }
    }

    let oldValue = isMultiSource
        ? new Array((source).length).fill(INITIAL_WATCHER_VALUE)
        : INITIAL_WATCHER_VALUE
    const job = () => {
        if (!effect.active) {
            return
        }
        if (cb) {
            // watch(source, cb)
            const newValue = effect.run()
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
                    // pass undefined as the old value when it's changed for the first time
                    oldValue === INITIAL_WATCHER_VALUE
                        ? undefined
                        : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE
                            ? []
                            : oldValue,
                    onCleanup
                ])
                oldValue = newValue
            }
        } else {
            // watchEffect
            effect.run()
        }
    }

    // important: mark the job as a watcher callback so that scheduler knows
    // it is allowed to self-trigger (#1727)
    job.allowRecurse = !!cb

    let scheduler
    if (flush === 'sync') {
        scheduler = job // the scheduler function gets called directly
    } else if (flush === 'post') {
        // scheduler = () => queuePostRenderEffect(job, instance && instance.suspense)
    } else {
        // default: 'pre'
        job.pre = true
        if (instance) job.id = instance.uid
        scheduler = () => queueJob(job)
    }

    const effect = new ReactiveEffect(getter, scheduler)

    // initial run
    if (cb) {
        if (immediate) {
            job()
        } else {
            oldValue = effect.run()
        }
    } else if (flush === 'post') {
        // queuePostRenderEffect(
        //     effect.run.bind(effect),
        //     instance && instance.suspense
        // )
    } else {
        effect.run()
    }

    const unwatch = () => {
        effect.stop()
        // if (instance && instance.scope) {
        //     remove(instance.scope.effects!, effect)
        // }
    }

    return unwatch
}

export function traverse(value, seen) {
    if (!isObject(value) || value[ReactiveFlags.SKIP]) {
        return value
    }
    seen = seen || new Set()
    if (seen.has(value)) {
        return value
    }
    seen.add(value)
    if (isRef(value)) {
        traverse(value.value, seen)
    } else if (isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            traverse(value[i], seen)
        }
    } else if (isSet(value) || isMap(value)) {
        value.forEach((v) => {
            traverse(v, seen)
        })
    } else if (isPlainObject(value)) {
        for (const key in value) {
            traverse(value[key], seen)
        }
    }
    return value
}
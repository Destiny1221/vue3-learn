import { isFunction, isPromise } from '../shared/index.js'
export function callWithErrorHandling(
    fn,
    args
) {
    let res
    try {
        res = args ? fn(...args) : fn()
    } catch (err) {
        console.log('error:', err)
    }
    return res
}

export function callWithAsyncErrorHandling(
    fn,
    args
) {
    if (isFunction(fn)) {
        const res = callWithErrorHandling(fn, args)
        if (res && isPromise(res)) {
            res.catch(err => {
                console.log('error:', err)
            })
        }
        return res
    }

    const values = []
    for (let i = 0; i < fn.length; i++) {
        values.push(callWithAsyncErrorHandling(fn[i], args))
    }
    return values
}
import { isFunction, isPromise } from '../shared/index.js'

/**
 * @param {*} fn 待执行的函数
 * @param {*} instance 组件实例
 * @param {*} args 执行fn所需要的参数
 * @returns 
 */
export function callWithErrorHandling(
    fn,
    instance,
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

// 参数与callWithErrorHandling类似，不同的是可以接受一个fn数组
export function callWithAsyncErrorHandling(
    fn,
    instance,
    args
) {
    // 如果是一个函数，调用callWithErrorHandling执行该函数，如果该函数的返回结果是一个Promise对象，使用res.catch处理异步错误
    if (isFunction(fn)) {
        const res = callWithErrorHandling(fn, instance, args)
        if (res && isPromise(res)) {
            res.catch(err => {
                console.log('error:', err)
            })
        }
        return res
    }

    // 如果是一个fn数组遍历数组，依次执行callWithAsyncErrorHandling函数，将运行后的结果保存在values数组中返回
    const values = []
    for (let i = 0; i < fn.length; i++) {
        values.push(callWithAsyncErrorHandling(fn[i], instance, args))
    }
    return values
}
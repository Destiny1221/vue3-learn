import {
    ref,
    reactive,
} from '../../reactivity/index.js'
import { watch, watchEffect } from '../../runtime-core/apiWatch.js'
const age = ref(10)
const obj = reactive({
    name: 'jack'
})

const unwatch = watch([age, () => obj.name], (val, oldVal) => {
    console.log('newVal:', val)
    console.log('oldVal:', oldVal)
})

// 有时副作用函数会执行一些异步的副作用，如果在响应式数据发生变更时，异步副作用函数还没有执行完毕，那么取消该操作
// 下述只会打印一次网络请求成功，对于第一次初始化网络请求成功应该取消不打印。
watchEffect((onInvalidate) => {
    const timer = setTimeout(() => {
        console.log("网络请求成功:", age.value);
    }, 2000)
    onInvalidate(() => {
        clearTimeout(timer)
    })
    console.log('age的值：', age.value)
})

age.value = 20
// age.value = 30
// obj.name = 'rose'
// unwatch()
// obj.name = 'ro'


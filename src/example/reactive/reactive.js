import { reactive, effect, toRaw, isReactive } from '../../reactivity/index.js'
var obj = {
	name: 'jack'
}
var reactiveObj = reactive(obj)
console.log(toRaw(reactiveObj))
console.log(isReactive(reactiveObj))

effect(() => {
	console.log('获取响应式对象属性【name】值：', reactiveObj.name)
	effect(() => {
		console.log('获取内层响应式对象属性【name】值：', reactiveObj.name)
	})
})

setTimeout(() => {
	reactiveObj.name = 'rose'
}, 2000)

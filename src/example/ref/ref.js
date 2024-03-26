import {
	ref,
	shallowRef,
	effect,
	reactive,
	toRefs,
	computed
} from '../../reactivity/index.js'
const age = ref(10)
const shallowObj = shallowRef({
	name: 'jack'
})

const obj = reactive({
	age: 20,
	name: 'jack'
})

const state = toRefs(obj)
effect(() => {
	console.log('age:', age.value)
})
effect(() => {
	console.log('shallowObj.name', shallowObj.value.name)
})

effect(() => {
	console.log('state', state)
})

const calcAge = computed(() => {
	console.log('compputed 缓存')
	return age.value + 5
})
console.log('calcAge:', calcAge.value)
console.log('calcAge:', calcAge.value)
setTimeout(() => {
	age.value = 20
	console.log('calcAge:', calcAge.value)
	shallowObj.value = {
		name: 'rose'
	}
}, 1000)

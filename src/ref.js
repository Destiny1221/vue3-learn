import { ref, shallowRef, effect, reactive, toRefs } from './reactivity/index.js'
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
setTimeout(() => {
    age.value = 20
    shallowObj.value = {
        name: 'rose'
    }
}, 1000)
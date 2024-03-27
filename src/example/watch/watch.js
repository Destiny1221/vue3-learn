import {
    ref,
    reactive,
} from '../../reactivity/index.js'
import { watch, watchEffect } from '../../runtime-core/apiWatch.js'
const age = ref(10)
const obj = reactive({
    name: 'jack'
})

watch([age,obj.name], (val, oldVal) => {
    console.log(val)
    console.log(oldVal)
})

// watchEffect(() => {
//     console.log('age的值：', age.value)
// })

age.value = 20
// obj.name = 'rose'


# vue3 响应式原理解析
本学习源码是基于Vue3/Core  参考代码 Vue 3.3.13
## 理解副作用函数和响应式数据

### 副作用函数
会产生副作用的函数就被称为副作用函数，当一个函数的运行会影响到其他函数或者变量，那么这种影响就是一种副作用
function changeText(text: string) {
  document.body.innerText = text
}
执行这个changeText函数会修改body中的内容，显然这是个副作用函数

### 响应式数据
let obj = { a: 1, b: 1 }
function sum(a: number, b: number) {
  return a + b
}

let c = sum(obj.a, obj.b)
上述代码c的结果为2，这很简单。如果我们将obj.a改为2，那么c的结果是不会变的，我们必须再次调用sum函数才可以。想象一下，如果我们修改obj.a或者obj.b，不需要我们调用
sum函数，c能同步更新该多好，如果可以实现这种功能，那么obj就是一个响应式数据

## 响应式处理
Vue3响应式处理主要集中在packages/reactivity/src/effect.ts文件中

### effect
在Vue3中，会使用effect注册一个副作用函数。当响应式数据发生更新时，我们希望副作用函数中的数据也能同步更新，为了实现这种效果，就需要我们做两个工作：
  在读取响应式数据时，收集副作用函数
  在设置响应式数据时，触发副作用函数
effect函数解析参考src/reactivity/effect.js


## reactive 实现

### reactive--Object响应式实现
处理数组、对象的响应式，不涉及Collection类型(Set、Map)

### createReactiveObject 工厂函数
reactive函数的创建是使用工厂模式设计原则创建，利用createReactiveObject该函数通过传递不同的参数实现响应式函数，因为Vue3中shallowReactive、readonly、shallowReadonly这些api的
实现也全部是由该工厂函数实现的，因此我们主要关注createReactiveObject的实现，内部实现方式就是使用new Proxy代理对象，因此我们主要需要关注传递给Proxy的handlers对象。

#### mutableHandlers
在源码中会针对target的类型采用不同的handlers，如果是Object|Array使用mutableHandlers，如果是Map、Set、WeakMap、WeakSet使用对应的collectionHandlers，在实际过程中baseHandlers使用频率很高，因此我们只研究mutableHandlers的实现。mutableHandlers中定义了五种捕获器：get、set、deleteProperty、has、ownKeys。主要思想就是在get的时候
进行依赖收集(track)，set的时候进行依赖更新(trigger)。源码的实现会考虑诸多细节。

#### 其他reactive
除了reactive，readonly、shallowReadonly、shallowReactive均是通过createReactiveObject创建的，只不过是传递参数不同。用isReadonly、isShallow两个变量进行区分。

## ref 实现
ref接受一个内部值，返回响应式、可更改的ref对象，此对象只有一个指向其内部值的property .value

ref的核心是使用Object.defineProperty实现的，通过劫持属性value字段实现响应式，由于语法上使用的是es6的类，因此Object.defineProperty转换为
使用get、set函数进行依赖收集更新。

ref的通过class实现，通过class的取值函数和存值函数进行依赖的收集与触发。

对于深度响应式的ref，会在向value属性赋值过程中，将新的值转为reactive，以达到深度响应式的效果。

## 响应式API中的工具函数

### isRef
通过对象中是否存在__v_isRef属性并且__v_isRef对应值为true来判断是否为ref

### unRef
如果是Ref类型则返回ref.value，否则直接返回ref

### toRef
如果是Ref类型则返回ref.value，否则直接返回ref

## computed 实现
具体分析请参考computed.js

为了加深对computed的理解，用一个例子分析compued的缓存及计算过程

``` 
const value = reactive({ foo: 1 })
const cValue = computed(() => value.foo)
console.log(cValue.value) // 1
console.log(cValue.value) // 1

value.foo = 2
console.log(cValue.value) // 2
```
首先执行computed(() => value.foo)方法时，会创建一个ComputedRefImpl类型的实例，在初始化实例时，会创建一个ReactiveEffect对象，将我们的getter函数保存进去，以及传入一个调度器函数scheduler，scheduler函数体内主要就是修改_dirty属性值。

当打印cValue.value，会命中ComputedRefImpl对应的get方法，在get中执行trackRefValue收集对应的依赖(由于此时没有处于活跃状态的effect，及activeEffect，所以并不会进行依赖收集)。接着默认_dirty为true，将_dirty设置为false，并执行effect.run，计算数据，计算完成后将数据缓存值self._value中，方便下次利用。在调用effect.run过程中，会将ComputedRefImpl构造器中创建的ReactiveEffect实例收集到 targetMap[toRaw(value)].foo 中。当我们再次打印cValue.value时，会重新跑一遍上述get方法，只不过由于_dirty被置为false，所以不会执行effect.run，会直接返回缓存_value中的数据，以此达到缓存目的。

当修改value.foo = 2，触发  targetMap[toRaw(value)].foo 中的依赖，执行依赖更新，由于初始化ReactiveEffect时设置了一个调度器，因此本次依赖更新只会执行这个调度器函数，将_dirty变量重置为true，并手动调用triggerRefValue触发依赖，在调用triggerRefValue的过程中，因为 cValue.dep=undefined，所以没有依赖要触发。

当第三次打印cValue.value时，由于_dirty为true，所以会执行cValue.effect.run，并将结果赋值给cValue._value，最后返回cValue._value，打印2

## computed 总结
computed本质也是个ref（ComputedRefImpl），它是懒惰的，如果不使用计算属性，那么是不会进行计算的，只有使用它，才会调用计算属性中的effect.run方法进行计算，同时将结果缓存
到_value中。

在第一次获取计算属性的值的过程中会进行依赖收集，假设计算属性的计算与响应式对象的a、b两个属性有关，会将computed中生成的ReactiveEffect实例收集到targetMap[obj].a、targetMap[obj].b中，一旦a或b属性变化了，会触发依赖，而依赖触发的过程中会执行调度函数，在调度函数中会将脏数据表示_dirty设置为true，并触发计算属性的依赖更新。那么在·下一次使用计算属性
的话，由于_dirty为true，便会重新调用effect.run方法重新计算值。


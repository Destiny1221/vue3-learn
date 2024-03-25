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
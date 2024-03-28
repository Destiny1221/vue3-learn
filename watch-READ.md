# 调度器 scheduler

scheduler 是Vue3中比较重要的一个概念。通过scheduler调度任务可以控制副作用函数执行的时机以及执行次数。通过之前的研究我们发现 ReactiveEffect 对象实例化时
可以传入一个scheduler，当触发依赖更新时，如果activeEffect不存在scheduler，就直接执行effect.run()即执行副作用函数，否则就会执行effect.scheduler()，在scheduler
中我们可以将副作用函数放入微任务队列中来改变副作用函数的执行时机。watchEffect侦听数据源会在组件渲染之前执行，watchSyncEffect侦听数据源会在依赖发生后立即执行，watchPostEffect
侦听数据源会在组件渲染完才执行。这些不同的执行顺序，就是通过scheduler进行统一调度的。

## watch
watch接收三个参数：source监听的源、cb回调函数、options监听配置，watch函数返回一个停止监听函数。。
在watch中调用了一个叫做doWatch的函数，与watch作用相似的watchEffect、watchPostEffect、watchSyncEffect内部也都使用了这个doWatch函数，区别在于传给doWatch的参数不同以此来实现不同的侦听结果。

### doWatch
具体分析见apiWatch.js。

### 代码分析
const obj = reactive(name:'jack')
watch(obj.name,cb) // 无效
watch(()=>obj.name,cb) // 有效
这是因为在执行watch函数执行，会先访问obj.name，此时触发依赖收集，由于doWatch函数没有执行因此没有activeEffect，因此无法进行依赖收集。当执行第二种时，不会先执行()=>obj.name，
因此会进入doWatch方法创建effect，此时在effect.run中执行()=>obj.name函数，触发依赖收集，依赖收集成功。

### 总结
watch、watchEffect、watchSyncEffect、watchPostEffect的实现均是通过一个doWatch函数实现。

doWatch中会首先生成一个getter函数。如果是watchAPI，那么这个getter函数中会根据传入参数，访问监听数据源中的属性（可能会递归访问对象中的属性，取决于deep），并返回与数据源数据类型一致的数据（如果数据源是ref类型，getter函数返回ref.value；如果数据源类型是reactive，getter函数返回值也是reactive；如果数据源是数组，那么getter函数返回值也应该是数组；如果数据源是函数类型，那么getter函数返回值是数据源的返回值）。如果是watchEffect等API，那么getter函数中会执行source函数。

然后定义一个job函数。如果是watch，job函数中会执行effect.run获取新的值，并比较新旧值，是否执行cb；如果是watchEffect等API，job中执行effect.run。

当声明完job，会紧跟着定义一个调度器，这个调度器的作用是根据flush将job放到不同的任务队列中。

然后根据getter与调度器scheduler初始化一个ReactiveEffect实例。

接着初始化：如果是watch并且immediate:true，立即执行job，否则会执行effect.run更新oldValue。如果flush是post，会将effect.run函数放到延迟队列中延迟执行；其他情况执行effect.run。
最后返回一个停止watch函数。
import { callWithErrorHandling } from './errorHandling.js'
import { isArray } from '../shared/index.js'

let isFlushing = false
let isFlushPending = false

const queue = []
let flushIndex = 0

const pendingPostFlushCbs = []
let activePostFlushCbs = null
let postFlushIndex = 0

const resolvedPromise = /*#__PURE__*/ Promise.resolve()
let currentFlushPromise = null

export function nextTick(
  _this,
  fn
) {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(_this ? fn.bind(_this) : fn) : p
}

// #2768
// Use binary-search to find a suitable position in the queue,
// so that the queue maintains the increasing order of job's id,
// which can prevent the job from being skipped and also can avoid repeated patching.
function findInsertionIndex(id) {
  // the start index should be `flushIndex + 1`
  let start = flushIndex + 1
  let end = queue.length

  while (start < end) {
    const middle = (start + end) >>> 1
    const middleJob = queue[middle]
    const middleJobId = getId(middleJob)
    if (middleJobId < id || (middleJobId === id && middleJob.pre)) {
      start = middle + 1
    } else {
      end = middle
    }
  }

  return start
}

// queue队列入队
export function queueJob(job) {
  // 当满足以下情况中的一种才可以入队
  // 1. queue长度为0
  // 2. queue中不存在job（如果job是watch()回调，搜索从flushIndex + 1开始，否则从flushIndex开始）
  const flushIncludesIndex = isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex
  if (
    !queue.length ||
    !queue.includes(
      job,
      flushIncludesIndex
    )
  ) {
    // job.id为null直接入队 undefined == null 返回true
    if (job.id == null) {
      queue.push(job)
    } else {
      // 插队，插队后queue索引区间[flushIndex + 1, end]内的job.id是非递减的
      // findInsertionIndex方法通过二分法寻找[flushIndex + 1, end]区间内大于等于job.id的第一个索引
      queue.splice(findInsertionIndex(job.id), 0, job)
    }
    queueFlush()
  }
}

function queueFlush() {
  // isFlushing表示是否正在执行队列
  // isFlushPending表示是否正在等待执行队列
  // 如果此时未在执行队列也没有正在等待执行队列，则需要将isFlushPending设置为true，表示队列进入等待执行状态
  // 同时在下一个微任务队列执行flushJobs，即在下一个微任务队列执行队列
  // 放入微任务队列中是为了将flushJobs尽可能的提前执行

  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}

export function invalidateJob(job) {
  const i = queue.indexOf(job)
  if (i > flushIndex) {
    queue.splice(i, 1)
  }
}

export function queuePostFlushCb(cb) {
  // 如果cb不是数组
  if (!isArray(cb)) {
    // 激活队列为空或cb不在激活队列中，需要将cb添加到对应队列中
    if (
      !activePostFlushCbs ||
      !activePostFlushCbs.includes(
        cb,
        cb.allowRecurse ? postFlushIndex + 1 : postFlushIndex
      )
    ) {
      pendingPostFlushCbs.push(cb)
    }
  } else {
    // 如果 cb 是一个数组，那么它是一个组件生命周期钩子
    // 其已经被去重了，因此我们可以在此处跳过重复检查以提高性能
    pendingPostFlushCbs.push(...cb)
  }
  queueFlush()
}

export function flushPreFlushCbs(
  instance,
  // if currently flushing, skip the current job itself
  i = isFlushing ? flushIndex + 1 : 0
) {
  for (; i < queue.length; i++) {
    const cb = queue[i]
    if (cb && cb.pre) {
      if (instance && cb.id !== instance.uid) {
        continue
      }
      queue.splice(i, 1)
      i--
      cb()
    }
  }
}

export function flushPostFlushCbs() {
  // 存在job队列才执行
  if (pendingPostFlushCbs.length) {
    // 去重
    const deduped = [...new Set(pendingPostFlushCbs)]

    // 清空pendingPostFlushCbs
    pendingPostFlushCbs.length = 0

    // #1947 already has active queue, nested flushPostFlushCbs call
    // 已经存在activePostFlushCbs，嵌套flushPostFlushCbs调用，直接return
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped)
      return
    }

    activePostFlushCbs = deduped

    // 按job.id升序，在Vue中id越小优先级越高
    activePostFlushCbs.sort((a, b) => getId(a) - getId(b))

    // 循环执行job
    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      activePostFlushCbs[postFlushIndex]()
    }
    // 重置activePostFlushCbs及、postFlushIndex
    activePostFlushCbs = null
    postFlushIndex = 0
  }
}

const getId = (job) => (job.id == null ? Infinity : job.id)

const comparator = (a, b) => {
  const diff = getId(a) - getId(b)
  if (diff === 0) {
    if (a.pre && !b.pre) return -1
    if (b.pre && !a.pre) return 1
  }
  return diff
}

function flushJobs() {
  // 将isFlushPending置为false，isFlushing置为true
  // 因为此时已经要开始执行队列了
  isFlushPending = false
  isFlushing = true

  // queue按job.id升序排列
  // 这可确保：
  // 1. 组件从父组件先更新然后子组件更新。（因为 parent 总是在 child 之前创建，所以它的render effect会具有较高的优先级）
  // 2. 如果在 parent 组件更新期间卸载组件，则可以跳过其更新
  queue.sort(comparator)

  // 执行queue中的任务
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job && job.active !== false) {
        // console.log(`running:`, job.id)
        callWithErrorHandling(job, null)
      }
    }
  } finally {
    // 清空queue并将flushIndex重置为0
    flushIndex = 0
    queue.length = 0

    // 执行后置任务队列
    flushPostFlushCbs()

    // 将isFlushing置为false，说明此时任务已经执行完
    isFlushing = false
    currentFlushPromise = null

    // 执行剩余job
    // postFlushCb队列执行过程中可能有job加入，继续调用flushJobs执行剩余job
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs()
    }
  }
}

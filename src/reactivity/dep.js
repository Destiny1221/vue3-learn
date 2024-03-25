import { trackOpBit } from './effect.js'


// type TrackedMarkers = {
  /**
   * wasTracked
   * 记录当前依赖之前是否被收集过，当执行依赖更新时，还是会走ReactiveEffect
   * 的run方法，此时会执行initDepMarkers，对已经收集过的依赖标记其w属性，表示该依赖在之前
   * 已经收集过了，无需再收集
   */
  // w: number
  /**
   * newTracked
   * 记录在当前依赖收集的过程中，即本次run执行的过程中是否收集过该依赖
   */
  // n: number
// }

/**
 * 
 * @param {*} effects ?:ReactiveEffect[]
 * @returns 
 */
export const createDep = (effects) => {
  const dep = new Set(effects)
  dep.w = 0
  dep.n = 0
  return dep
}

// wasTracked(dep)返回true，意味着dep在之前的依赖收集过程中已经被收集过，或者说在之前run执行过程中已经被收集
export const wasTracked = (dep) => (dep.w & trackOpBit) > 0

// newTracked(dep)返回false，意味着dep是在本次依赖收集过程中新收集到的，或者说在本次run执行过程中新收集到的
export const newTracked = (dep) => (dep.n & trackOpBit) > 0

// 初始化dep的w属性
export const initDepMarkers = ({ deps }) => {
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].w |= trackOpBit // 标记依赖已经被收集过
    }
  }
}


// 清空dep的w和n的标识位，并删除冗余dep
/**
 * 
 * @param {*} effect ReactiveEffect
 */
export const finalizeDepMarkers = (effect) => {
  const { deps } = effect
  if (deps.length) {
    let ptr = 0
    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i]
      if (wasTracked(dep) && !newTracked(dep)) {
        dep.delete(effect)
      } else {
        deps[ptr++] = dep
      }
      // 清空依赖标记
      dep.w &= ~trackOpBit
      dep.n &= ~trackOpBit
    }
    deps.length = ptr
  }
}

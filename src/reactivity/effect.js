import { extend, isArray } from "../shared/index.js"
import { createDep } from './dep.js'

let activeEffect

let shouldTrack = true

const targetMap = new WeakMap()

class ReactiveEffect {
    active = true
    deps = []
    parent = undefined

    constructor(fn) {
        this.fn = fn
        console.log("创建 ReactiveEffect 对象");
    }

    run() {
        if (!this.active) {
            return this.fn()
        }
        let parent = activeEffect
        let lastShouldTrack = shouldTrack
        while (parent) {
            if (parent === this) {
                return
            }
            parent = parent.parent
        }
        try {
            this.parent = activeEffect
            activeEffect = this
            shouldTrack = true
            return this.fn()
        } finally {
            activeEffect = this.parent
            shouldTrack = lastShouldTrack
            this.parent = undefined
        }
    }
}

export function effect(fn, options) {
    const _effect = new ReactiveEffect(fn)
    if (options) {
        extend(_effect, options)
    }
    if (!options || !options.lazy) {
        _effect.run()
    }
    // 让用户可以自行选择调用的时机（调用 fn）
    const runner = _effect.run.bind(_effect);
    runner.effect = _effect;
    return runner;
}

export function isTracking() {
    return shouldTrack && activeEffect
}

export function track(object, key) {
    if (isTracking()) {
        let depsMap = targetMap.get(object)
        if (!depsMap) {
            targetMap.set(object, depsMap = new Map())
        }
        let dep = depsMap.get(key)
        if (!dep) {
            depsMap.set(key, dep = createDep())
        }
        trackEffects(dep)
    }
}

export function trackEffects(dep) {
    if (shouldTrack) {
        dep.add(activeEffect)
        activeEffect.deps.push(dep)
    }
}

export function trigger(object, key) {
    const depsMap = targetMap.get(object)
    if (!depsMap) {
        // never been tracked
        return
    }
    let deps = []
    deps.push(depsMap.get(key))
    triggerEffects(deps[0])
}

export function triggerEffects(dep) {
    triggerEffect(Array.from(dep))
}

export function triggerEffect(dep) {
    // 执行收集到的所有的 effect 的 run 方法
    for (const effect of dep) {
        if (effect.scheduler) {
            // scheduler 可以让用户自己选择调用的时机
            // 这样就可以灵活的控制调用了
            // 在 runtime-core 中，就是使用了 scheduler 实现了在 next ticker 中调用的逻辑
            effect.scheduler();
        } else {
            effect.run();
        }
    }
}
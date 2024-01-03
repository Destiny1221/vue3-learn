
import { hasChanged, isObject, isArray } from "../shared/index.js"
import { toRaw, toReactive, isShallow, isReadonly } from './reactive.js'
import { createDep } from "./dep.js"
import { isTracking, trackEffects, triggerEffects } from './effect.js'
class RefImpl {
  _value
  _rawValue

  dep = undefined
  __v_isRef = true

  constructor(value, __v_isShallow) {
    this.__v_isShallow = __v_isShallow
    this._rawValue = __v_isShallow ? value : toRaw(value)
    /**
     * 这里是shallowRef和ref的区别所在
     * const obj = shallowRef({name:'jack'})
     * obj.value.name = xxx 不会是响应式，因为obj.value只是一个普通对象，不是被proxy代理过得对象
     *  */
    this._value = __v_isShallow ? value : toReactive(value)
  }

  // ref的核心是使用Object.defineProperty实现的，通过劫持属性value字段实现响应式，由于使用的是es6的类，因此Object.defineProperty 使用 get、set关键字劫持
  get value() {
    trackRefValue(this)
    return this._value
  }

  set value(newVal) {
    const useDirectValue =
      this.__v_isShallow || isShallow(newVal) || isReadonly(newVal)
    newVal = useDirectValue ? newVal : toRaw(newVal)
    if (hasChanged(newVal, this._rawValue)) {
      this._rawValue = newVal
      this._value = useDirectValue ? newVal : toReactive(newVal)
      // 触发更新
      triggerRefValue(this, newVal)
    }
  }
}

class ObjectRefImpl {
  __v_isRef = true
  constructor(_object, _key, _defaultValue) {
    this._object = _object
    this._key = _key
    this._defaultValue = _defaultValue
  }

  get value() {
    const val = this._object[this._key]
    return val === undefined ? this._defaultValue : val
  }

  set value(newVal) {
    this._object[this._key] = newVal
  }
}

export function isRef(value) {
  return !!value.__v_isRef
}

export function ref(value) {
  return createRef(value, false)
}

export function shallowRef(value) {
  return createRef(value, true)
}

export function trackRefValue(ref) {
  if (isTracking()) {
    trackEffects(ref.dep || (ref.dep = createDep()))
  }
}

export function triggerRefValue(ref) {
  triggerEffects(ref.dep)
}


function createRef(rawValue, shallow) {
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}

export function toRef(source, key, defaultValue) {
  if (isRef(source)) {
    return source
  } else if (isObject(source) && arguments.length > 1) {
    // 基于响应式对象的一个属性，创建对应的ref 如果是对象，接参数大于1，创建ObjectRefImpl类型对象 使用上toRef(obj,'name')
    return propertyToRef(source, key, defaultValue)
  } else {
    return ref(source)
  }
}

export function toRefs(object) {
  const ret = isArray(object) ? new Array(object.length) : {}
  for (const key in object) {
    ret[key] = propertyToRef(object, key)
  }
  return ret
}

function propertyToRef(source, key, defaultValue) {
  const val = source[key]
  if (isRef(val)) {
    return val
  }
  return new ObjectRefImpl(source, key, defaultValue)
}



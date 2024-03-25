
import { hasChanged, isObject, isArray, isFunction } from "../shared/index.js"
import { toRaw, toReactive, isShallow, isReadonly,isProxy } from './reactive.js'
import { createDep } from "./dep.js"
import { isTracking, trackEffects, triggerEffects } from './effect.js'
class RefImpl {
  _value
  _rawValue

  // 当前ref的依赖
  dep = undefined
  __v_isRef = true

  constructor(value, __v_isShallow) {
    this.__v_isShallow = __v_isShallow
    // 将原始值保存进_rawValue变量中
    this._rawValue = __v_isShallow ? value : toRaw(value)
    /**
     * 将value的响应式数据保存进_value中
     * 这里是shallowRef和ref的区别所在
     * const obj = shallowRef({name:'jack'})
     * obj.value.name = xxx 不会是响应式更新，执行时会先触发get函数返回obj._value，然后再修改obj._value，因为obj._value是普通对象，所以不会有副作用触发
     *  */
    this._value = __v_isShallow ? value : toReactive(value)
  }

  // ref的核心是使用Object.defineProperty实现的，通过劫持属性value字段实现响应式，由于使用的是es6的类，因此Object.defineProperty 使用 get、set拦截器拦截
  get value() {
    trackRefValue(this)
    return this._value
  }

  set value(newVal) {
    // 判断该类型是不是通过shallowRef创建，以及赋予的新值是否是shallow或者readonly
    const useDirectValue =
      this.__v_isShallow || isShallow(newVal) || isReadonly(newVal)
    newVal = useDirectValue ? newVal : toRaw(newVal)
    if (hasChanged(newVal, this._rawValue)) {
      // 更新原始值及响应式数据
      this._rawValue = newVal
      this._value = useDirectValue ? newVal : toReactive(newVal)
      // 触发更新
      triggerRefValue(this, newVal)
    }
  }
}

/**
 * CustomRefImpl的实现与RefImpl的实现差不多，都有个value的get、set函数，
 * 只不过get、set在内部会调用用户自己定义的get与set函数。当进行初始化时，会将收集依赖的函数与触发依赖的函数作为参数传递给factory
 * 这样用户就可以自己控制依赖收集与触发的时机。
 */
class CustomRefImpl {
  dep
  _get
  _set
  _get
  _set = true

  constructor(factory) {
    // 工厂函数接受track、trigger两个函数作为参数，其实就是调用trackRefValue、triggerRefValue方法进行依赖收集
    // 方便用户自行确定何时收集依赖，何时触发更新
    const { get, set } = factory(
      () => trackRefValue(this),
      () => triggerRefValue(this)
    )
    this._get = get
    this._set = set
  }

  get value() {
    return this._get()
  }

  set value(newVal) {
    this._set(newVal)
  }
}

/**
 * 创建一个自定义的ref，显式声明对其依赖追踪和更新触发的控制方式
 */
export function customRef(factory) {
  return new CustomRefImpl(factory)
}

/**
 * 在ObjectRefImpl构造器中会分别将object、key、defaultValue保存至自己的私有属性中
 * 当获取ObjectRefImpl实例的value属性时，会从this._object中获取数据，由于this._object
 * 和原来的object内存地址一置，object对象本身就是一个响应式对象，所以这和直接使用obj通过key获取数据没有区域区别，只不过通过
 * toRef转换后可以香ref类型一样，通过value属性进行取值、设置。
 */
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

// 通过对象中是否存在__v_isRef属性并且__v_isRef属性值为true
export function isRef(value) {
  return !!(value && value.__v_isRef === true)
}

export function ref(value) {
  // createRef接收两个参数：rawValue待转换的值、shallow浅层响应式
  return createRef(value, false)
}

// shallowRef的实现同样通过createRef函数，不过参数shallow为true
export function shallowRef(value) {
  return createRef(value, true)
}

// 当获取new RefImpl()的value属性时，会调用trackRefValue进行依赖收集，与reactive不同的是
// ref的依赖会被保存在ref.dep中
export function trackRefValue(ref) {
  if (isTracking()) {
    ref = toRaw(ref)
    trackEffects(ref.dep || (ref.dep = createDep()))
  }
}

// 强制触发ref的副作用函数，triggerRef主要应用于shallowRef的内部值进行深度变更后，主动调用triggerRef以触发依赖
// 手动调用triggerRefValue方法，强制执行一遍依赖对应的effect函数
export function triggerRefValue(ref) {
  ref = toRaw(ref)
  const dep = ref.dep
  triggerEffects(dep)
}

// 如果参数是 ref，则返回内部值，否则返回参数本身，其实就是一个语法糖
export function unref(ref) {
  return isRef(ref) ? ref.value : ref
}


class GetterRefImpl {
  __v_isRef = true
  __v_isReadonly = true
  constructor(_getter) {
    this._getter = _getter
  }
  get value() {
    return this._getter()
  }
}

function createRef(rawValue, shallow) {
  // 如果该值已经是一个ref类型的值直接返回,否则返回一个RefImpl实例
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}

/**
 * 可以将普通值、Ref独享或getters规范化为一个标准的Ref对象
 * 也可以基于响应式对象的一个属性，创建一个ref。这样创建的ref与其源属性保持同步：改变源属性的值将更新ref的值，反之亦然。
 * @param {*} source 待转换的对象
 * @param {*} key 待转换的key
 * @param {*} defaultValue 默认值
 * @returns 
 */
export function toRef(source, key, defaultValue) {
  if (isRef(source)) {
    return source
  } else if (isFunction(source)) {
    // 如果是一个函数，创建一个GetterRefImpl对象，访问该对象.value就会执行该函数，创建一个只读的ref
    return new GetterRefImpl(source)
  } else if (isObject(source) && arguments.length > 1) {
    // 基于响应式对象的一个属性，创建对应的ref 如果是对象，接参数大于1，创建ObjectRefImpl类型对象 使用上toRef(obj,'name')
    return propertyToRef(source, key, defaultValue)
  } else {
    return ref(source)
  }
}

/**
 * 将一个响应式对象转化为一个普通对象，该对象可以进行结构而不影响其响应式处理
 * toRefs会声明一个新的对象或数组，然后遍历object的key值，并调用propertyToRef方法，将结果存入新的对象或数组中
 * 最后返回这个新的对象或数组(相当于在内部调用了toRef方法)。
 * @param {*} object 
 * @returns 
 */
export function toRefs(object) {
  if(!isProxy(object)){
    console.warn(`toRefs() expects a reactive object but received a plain one.`)
  }
  const ret = isArray(object) ? new Array(object.length) : {}
  for (const key in object) {
    ret[key] = propertyToRef(object, key)
  }
  return ret
}

function propertyToRef(source, key, defaultValue) {
  const val = source[key]
  // 如果obj[key]本身是ref类型直接返回，否则返回一个ObjectRefImpl实例。
  if (isRef(val)) {
    return val
  }
  return new ObjectRefImpl(source, key, defaultValue)
}


// 将值、Ref对象或getters规范为值，这与unref()类似。其实就是在内部调用unref方法。
export function toValue(source) {
  return isFunction(source) ? source() : unref(source)
}



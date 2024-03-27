export const isObject = (val) => val !== null && typeof val === 'object'

export const isFunction = (val) => typeof val === 'function'

export const objectToString = Object.prototype.toString
export const toTypeString = (value) =>
  objectToString.call(value)

export const toRawType = (value) => {
  // extract "RawType" from strings like "[object RawType]"
  return toTypeString(value).slice(8, -1)
}

export const isArray = Array.isArray

export const isMap = (val) => toTypeString(val) === '[object Map]'
export const isSet = (val) => toTypeString(val) === '[object Set]'
export const isPlainObject = (val) => toTypeString(val) === '[object Object]'

export const isIntegerKey = (key) =>
  isString(key) &&
  key !== 'NaN' &&
  key[0] !== '-' &&
  '' + parseInt(key, 10) === key

export const isSymbol = (val) => typeof val === 'symbol'

const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (
  val,
  key
) => hasOwnProperty.call(val, key)

export const hasChanged = (value, oldValue) => !Object.is(value, oldValue)

export const extend = Object.assign

export const def = (obj, key, value) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    value
  })
}

export const NOOP = () => { }

export const isPromise = (val) => {
  return (
    (isObject(val) || isFunction(val)) &&
    isFunction(val.then) &&
    isFunction(val.catch)
  )
}

export const remove = (arr, el) => {
  const i = arr.indexOf(el)
  if (i > -1) {
    arr.splice(i, 1)
  }
}
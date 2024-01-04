export const isObject = (val) => val !== null && typeof val === 'object'

export const isFunction = (val) => typeof val === 'function'

export const isArray = Array.isArray

export const isIntegerKey = (key) =>
    isString(key) &&
    key !== 'NaN' &&
    key[0] !== '-' &&
    '' + parseInt(key, 10) === key

const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (
    val,
    key
) => hasOwnProperty.call(val, key)

export const hasChanged = (value, oldValue) => !Object.is(value, oldValue)

export const extend = Object.assign
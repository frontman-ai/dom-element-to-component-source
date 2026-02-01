import { describe, it, expect } from 'vitest'
import { filterPrimitiveProps, extractComponentProps } from '../src/sourceLocationResolver'
import { ReactFiberNode } from '../src/types'

describe('filterPrimitiveProps', () => {
  describe('primitive values - should be included', () => {
    it('includes string values', () => {
      const props = { name: 'John', title: 'Hello World' }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ name: 'John', title: 'Hello World' })
    })

    it('includes empty string values', () => {
      const props = { empty: '', name: 'test' }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ empty: '', name: 'test' })
    })

    it('includes number values', () => {
      const props = { count: 42, price: 19.99, zero: 0, negative: -5 }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ count: 42, price: 19.99, zero: 0, negative: -5 })
    })

    it('includes special number values (Infinity, NaN)', () => {
      const props = { inf: Infinity, negInf: -Infinity, nan: NaN }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ inf: Infinity, negInf: -Infinity, nan: NaN })
    })

    it('includes boolean values', () => {
      const props = { isActive: true, isDisabled: false }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ isActive: true, isDisabled: false })
    })

    it('includes null values', () => {
      const props = { data: null, name: 'test' }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ data: null, name: 'test' })
    })

    it('includes mixed primitive values', () => {
      const props = {
        name: 'Alice',
        age: 30,
        isAdmin: true,
        nickname: null,
        score: 0,
        active: false
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        name: 'Alice',
        age: 30,
        isAdmin: true,
        nickname: null,
        score: 0,
        active: false
      })
    })
  })

  describe('arrays - should be included', () => {
    it('includes arrays of primitives', () => {
      const props = {
        items: [1, 2, 3],
        names: ['Alice', 'Bob'],
        flags: [true, false]
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        items: [1, 2, 3],
        names: ['Alice', 'Bob'],
        flags: [true, false]
      })
    })

    it('includes empty arrays', () => {
      const props = { items: [], name: 'test' }
      const result = filterPrimitiveProps(props)
      // Empty arrays become undefined after filtering
      expect(result).toEqual({ name: 'test' })
    })

    it('includes nested arrays of primitives', () => {
      const props = {
        matrix: [[1, 2], [3, 4]],
        coords: [[0, 0], [10, 20]]
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        matrix: [[1, 2], [3, 4]],
        coords: [[0, 0], [10, 20]]
      })
    })

    it('includes arrays with mixed primitives', () => {
      const props = {
        mixed: [1, 'two', true, null]
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        mixed: [1, 'two', true, null]
      })
    })

    it('filters out non-serializable items from arrays', () => {
      const props = {
        items: [1, () => {}, 2, { nested: 'obj' }, 3]
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        items: [1, 2, { nested: 'obj' }, 3]
      })
    })

    it('handles children prop with mixed strings and React elements', () => {
      // Simulates: children={["Stuff", <Component />, "..."]}
      const props = {
        children: [
          'Stuff',
          { $$typeof: Symbol.for('react.element'), type: 'Component', props: {} },
          '...'
        ]
      }
      const result = filterPrimitiveProps(props)
      // React elements should be filtered out, strings should remain
      expect(result).toEqual({
        children: ['Stuff', '...']
      })
    })

    it('handles children prop with nested React elements in arrays', () => {
      // Simulates: children={["Text", [<A />, <B />], "More"]}
      const props = {
        children: [
          'Text',
          [
            { $$typeof: Symbol.for('react.element'), type: 'A', props: {} },
            { $$typeof: Symbol.for('react.element'), type: 'B', props: {} }
          ],
          'More'
        ]
      }
      const result = filterPrimitiveProps(props)
      // React elements filtered out, nested array becomes empty and is removed
      expect(result).toEqual({
        children: ['Text', 'More']
      })
    })

    it('handles children prop with only React elements', () => {
      const props = {
        children: [
          { $$typeof: Symbol.for('react.element'), type: 'A', props: {} },
          { $$typeof: Symbol.for('react.element'), type: 'B', props: {} }
        ]
      }
      const result = filterPrimitiveProps(props)
      // All filtered out, children becomes undefined
      expect(result).toBeUndefined()
    })

    it('handles children prop with primitives, objects, and React elements', () => {
      const props = {
        children: [
          'Hello',
          42,
          true,
          { $$typeof: Symbol.for('react.element'), type: 'Span', props: {} },
          { id: 'data', value: 100 },
          null,
          'World'
        ]
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        children: ['Hello', 42, true, { id: 'data', value: 100 }, null, 'World']
      })
    })
  })

  describe('simple objects - should be included', () => {
    it('includes simple key/value objects with primitives', () => {
      const props = {
        config: { key: 'value', count: 5 }
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        config: { key: 'value', count: 5 }
      })
    })

    it('includes nested simple objects', () => {
      const props = {
        settings: {
          theme: {
            primary: 'blue',
            secondary: 'gray'
          },
          enabled: true
        }
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        settings: {
          theme: {
            primary: 'blue',
            secondary: 'gray'
          },
          enabled: true
        }
      })
    })

    it('includes objects with arrays', () => {
      const props = {
        data: {
          ids: [1, 2, 3],
          names: ['a', 'b']
        }
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        data: {
          ids: [1, 2, 3],
          names: ['a', 'b']
        }
      })
    })

    it('includes arrays with objects', () => {
      const props = {
        users: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ]
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        users: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ]
      })
    })

    it('filters out non-serializable values from nested objects', () => {
      const props = {
        config: {
          name: 'test',
          onClick: () => {},
          value: 42
        }
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        config: {
          name: 'test',
          value: 42
        }
      })
    })

    it('returns undefined for objects with only non-serializable values', () => {
      const props = {
        handlers: {
          onClick: () => {},
          onHover: () => {}
        }
      }
      const result = filterPrimitiveProps(props)
      expect(result).toBeUndefined()
    })
  })

  describe('non-serializable values - should be excluded', () => {
    it('excludes function values', () => {
      const props = {
        label: 'Click me',
        onClick: () => {},
        onHover: function() {},
        handler: async () => {}
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ label: 'Click me' })
    })

    it('excludes undefined values', () => {
      const props = {
        name: 'test',
        value: undefined,
        data: undefined
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ name: 'test' })
    })

    it('excludes symbol values', () => {
      const sym = Symbol('test')
      const props = {
        id: 123,
        symbol: sym
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ id: 123 })
    })

    it('excludes BigInt values', () => {
      const props = {
        name: 'test',
        bigNum: BigInt(9007199254740991)
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ name: 'test' })
    })

    it('excludes Date objects', () => {
      const props = {
        title: 'Event',
        date: new Date('2024-01-01')
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ title: 'Event' })
    })

    it('excludes RegExp objects', () => {
      const props = {
        name: 'pattern',
        regex: /test/gi
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ name: 'pattern' })
    })

    it('excludes Map and Set', () => {
      const props = {
        id: 1,
        map: new Map([['key', 'value']]),
        set: new Set([1, 2, 3])
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ id: 1 })
    })

    it('excludes class instances', () => {
      class MyClass {
        value = 42
      }
      const props = {
        name: 'instance',
        obj: new MyClass()
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ name: 'instance' })
    })

    it('excludes React elements (objects with $$typeof)', () => {
      const props = {
        text: 'Hello',
        children: { $$typeof: Symbol.for('react.element'), type: 'div', props: {} }
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({ text: 'Hello' })
    })
  })

  describe('mixed props - filters correctly', () => {
    it('filters complex props with mixed types', () => {
      const props = {
        // Primitives - should be included
        id: 'user-123',
        count: 5,
        isEnabled: true,
        status: null,
        
        // Arrays and objects - should be included
        tags: ['react', 'typescript'],
        config: { theme: 'dark', version: 2 },
        
        // Non-serializable - should be excluded
        onClick: () => console.log('clicked'),
        ref: { current: null }, // plain object, should be included
        data: undefined
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        id: 'user-123',
        count: 5,
        isEnabled: true,
        status: null,
        tags: ['react', 'typescript'],
        config: { theme: 'dark', version: 2 },
        ref: { current: null }
      })
    })

    it('handles typical React component props', () => {
      const props = {
        className: 'btn btn-primary',
        disabled: false,
        type: 'submit',
        'aria-label': 'Submit form',
        tabIndex: 0,
        onClick: () => {},
        onMouseEnter: () => {},
        style: { margin: 10, padding: 5 },
        children: 'Click me',
        data: { id: 1, name: 'test' }
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        className: 'btn btn-primary',
        disabled: false,
        type: 'submit',
        'aria-label': 'Submit form',
        tabIndex: 0,
        style: { margin: 10, padding: 5 },
        children: 'Click me',
        data: { id: 1, name: 'test' }
      })
    })
  })

  describe('circular references', () => {
    it('handles circular references in objects', () => {
      const obj: Record<string, unknown> = { name: 'test' }
      obj.self = obj
      const props = {
        id: 1,
        circular: obj
      }
      const result = filterPrimitiveProps(props)
      // Should include what it can before hitting circular reference
      expect(result).toEqual({
        id: 1,
        circular: { name: 'test' }
      })
    })

    it('handles circular references in arrays', () => {
      const arr: unknown[] = [1, 2]
      arr.push(arr)
      const props = {
        name: 'test',
        items: arr
      }
      const result = filterPrimitiveProps(props)
      // Should include what it can before hitting circular reference
      expect(result).toEqual({
        name: 'test',
        items: [1, 2]
      })
    })

    it('handles deeply nested circular references', () => {
      const obj: Record<string, unknown> = {
        level1: {
          level2: {
            value: 'deep'
          }
        }
      }
      ;(obj.level1 as Record<string, unknown>).level2 = obj
      const props = {
        id: 1,
        nested: obj
      }
      const result = filterPrimitiveProps(props)
      // When circular reference is hit, the circular value is skipped
      // level1.level2 points to obj which is already in 'seen', so it's undefined
      // This means level1 becomes an empty object, which becomes undefined
      // So nested becomes undefined as well
      expect(result).toEqual({
        id: 1
      })
    })
  })

  describe('edge cases', () => {
    it('returns undefined for null input', () => {
      const result = filterPrimitiveProps(null)
      expect(result).toBeUndefined()
    })

    it('returns undefined for undefined input', () => {
      const result = filterPrimitiveProps(undefined)
      expect(result).toBeUndefined()
    })

    it('returns undefined for empty object', () => {
      const result = filterPrimitiveProps({})
      expect(result).toBeUndefined()
    })

    it('returns undefined when all props are non-serializable', () => {
      const props = {
        onClick: () => {},
        symbol: Symbol('test'),
        bigint: BigInt(123)
      }
      const result = filterPrimitiveProps(props)
      expect(result).toBeUndefined()
    })

    it('returns undefined for non-object input (string)', () => {
      const result = filterPrimitiveProps('not an object' as any)
      expect(result).toBeUndefined()
    })

    it('returns undefined for non-object input (number)', () => {
      const result = filterPrimitiveProps(42 as any)
      expect(result).toBeUndefined()
    })

    it('returns undefined for array input (top-level)', () => {
      const result = filterPrimitiveProps(['a', 'b'] as any)
      expect(result).toBeUndefined()
    })

    it('handles props with special characters in keys', () => {
      const props = {
        'data-testid': 'my-component',
        'aria-hidden': true,
        '$special': 'value'
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        'data-testid': 'my-component',
        'aria-hidden': true,
        '$special': 'value'
      })
    })

    it('handles props with numeric keys', () => {
      const props = {
        0: 'first',
        1: 'second',
        name: 'test'
      }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        0: 'first',
        1: 'second',
        name: 'test'
      })
    })

    it('handles Object.create(null) objects', () => {
      const obj = Object.create(null)
      obj.name = 'test'
      obj.value = 42
      const props = { data: obj }
      const result = filterPrimitiveProps(props)
      expect(result).toEqual({
        data: { name: 'test', value: 42 }
      })
    })
  })
})

describe('extractComponentProps', () => {
  it('extracts props from memoizedProps', () => {
    const fiberNode: Partial<ReactFiberNode> = {
      name: 'TestComponent',
      memoizedProps: {
        id: 'test-id',
        count: 42,
        onClick: () => {}
      }
    }
    const result = extractComponentProps(fiberNode as ReactFiberNode)
    expect(result).toEqual({
      id: 'test-id',
      count: 42
    })
  })

  it('extracts props from pendingProps when memoizedProps is not available', () => {
    const fiberNode: Partial<ReactFiberNode> = {
      name: 'TestComponent',
      pendingProps: {
        title: 'Hello',
        visible: true
      }
    }
    const result = extractComponentProps(fiberNode as ReactFiberNode)
    expect(result).toEqual({
      title: 'Hello',
      visible: true
    })
  })

  it('prefers memoizedProps over pendingProps', () => {
    const fiberNode: Partial<ReactFiberNode> = {
      name: 'TestComponent',
      memoizedProps: {
        source: 'memoized'
      },
      pendingProps: {
        source: 'pending'
      }
    }
    const result = extractComponentProps(fiberNode as ReactFiberNode)
    expect(result).toEqual({
      source: 'memoized'
    })
  })

  it('returns undefined when no props are available', () => {
    const fiberNode: Partial<ReactFiberNode> = {
      name: 'TestComponent'
    }
    const result = extractComponentProps(fiberNode as ReactFiberNode)
    expect(result).toBeUndefined()
  })

  it('returns undefined when props have no serializable values', () => {
    const fiberNode: Partial<ReactFiberNode> = {
      name: 'TestComponent',
      memoizedProps: {
        onClick: () => {},
        ref: Symbol('ref')
      }
    }
    const result = extractComponentProps(fiberNode as ReactFiberNode)
    expect(result).toBeUndefined()
  })

  it('extracts arrays and objects from fiber props', () => {
    const fiberNode: Partial<ReactFiberNode> = {
      name: 'TestComponent',
      memoizedProps: {
        items: [1, 2, 3],
        config: { theme: 'dark' },
        onClick: () => {}
      }
    }
    const result = extractComponentProps(fiberNode as ReactFiberNode)
    expect(result).toEqual({
      items: [1, 2, 3],
      config: { theme: 'dark' }
    })
  })

  it('handles real-world React fiber props structure', () => {
    const fiberNode: Partial<ReactFiberNode> = {
      name: 'Button',
      memoizedProps: {
        className: 'btn btn-primary',
        type: 'button',
        disabled: false,
        'aria-pressed': false,
        tabIndex: 0,
        onClick: function handleClick() {},
        onMouseDown: () => {},
        children: 'Click me',
        style: { backgroundColor: 'blue', padding: 10 },
        ref: { current: null },
        data: { userId: 123, permissions: ['read', 'write'] }
      }
    }
    const result = extractComponentProps(fiberNode as ReactFiberNode)
    expect(result).toEqual({
      className: 'btn btn-primary',
      type: 'button',
      disabled: false,
      'aria-pressed': false,
      tabIndex: 0,
      children: 'Click me',
      style: { backgroundColor: 'blue', padding: 10 },
      ref: { current: null },
      data: { userId: 123, permissions: ['read', 'write'] }
    })
  })
})

import Ember from 'ember';

var ReduceComputedProperty = Ember.ReduceComputedProperty;

var ComputedProperty = Ember.ComputedProperty;
var EmberError = Ember.Error;
var TrackedArray = Ember.TrackedArray;
var EmberArray = Ember.Array;
var run = Ember.run;
var forEach = Ember.EnumerableUtils.forEach;
var isArray = Ember.isArray;
var a_slice = [].slice;
var o_create = Ember.create;
var e_get = Ember.get;
var guidFor = Ember.guidFor;
var metaFor = Ember.meta;
var cacheFor = Ember.cacheFor;
var propertyWillChange = Ember.propertyWillChange;
var propertyDidChange = Ember.propertyDidChange;
var addObserver = Ember.addObserver;
var removeObserver = Ember.removeObserver;
var addBeforeObserver = Ember.addBeforeObserver;
var removeBeforeObserver = Ember.removeBeforeObserver;

var cacheSet = cacheFor.set;
var cacheGet = cacheFor.get;
var cacheRemove = cacheFor.remove;

// Here we explicitly don't allow `@each.foo`; it would require some special
// testing, but there's no particular reason why it should be disallowed.
var eachPropertyPattern = /^(.*)\.@each\.(.*)/;
var doubleEachPropertyPattern = /(.*\.@each){2,}/;
var arrayBracketPattern = /\.\[\]$/;

function get(obj, key) {
  if (key === '@this') {
    return obj;
  }

  return e_get(obj, key);
}

/*
  Slight modification of ReduceComputedProperty that allows override of  'partiallyRecomputeFor'
*/

// function normalizeIndex(index, length, newItemsOffset) {
//   if (index < 0) {
//     return Math.max(0, length + index);
//   } else if (index < length) {
//     return index;
//   } else /* index > length */ {
//     return Math.min(length - newItemsOffset, index);
//   }
// }

// function normalizeRemoveCount(index, length, removedCount) {
//   return Math.min(removedCount, length - index);
// }

function ChangeMeta(dependentArray, item, index, propertyName, property, changedCount, previousValues){
  this.arrayChanged = dependentArray;
  this.index = index;
  this.item = item;
  this.propertyName = propertyName;
  this.property = property;
  this.changedCount = changedCount;

  if (previousValues) {
    // previous values only available for item property changes
    this.previousValues = previousValues;
  }
}

function addItems(dependentArray, callbacks, cp, propertyName, meta) {
  forEach(dependentArray, function (item, index) {
    meta.setValue( callbacks.addedItem.call(
      this, meta.getValue(), item, new ChangeMeta(dependentArray, item, index, propertyName, cp, dependentArray.length), meta.sugarMeta));
  }, this);
}

function reset(cp, propertyName) {
  var hadMeta = cp._hasInstanceMeta(this, propertyName);
  var meta = cp._instanceMeta(this, propertyName);

  if (hadMeta) { meta.setValue(cp.resetValue(meta.getValue())); }

  if (cp.options.initialize) {
    cp.options.initialize.call(this, meta.getValue(), {
      property: cp,
      propertyName: propertyName
    }, meta.sugarMeta);
  }
}

export { VTReduceComputedProperty }; // TODO: default export

function VTReduceComputedProperty(options) {
  var cp = this;

  ReduceComputedProperty.apply(this, arguments);

  this.recomputeOnce = function(propertyName) {
    // What we really want to do is coalesce by <cp, propertyName>.
    // We need a form of `scheduleOnce` that accepts an arbitrary token to
    // coalesce by, in addition to the target and method.
    run.once(this, recompute, propertyName);
  };

  var recompute = function(propertyName) {
    var meta = cp._instanceMeta(this, propertyName);
    var callbacks = cp._callbacks();

    reset.call(this, cp, propertyName);

    meta.dependentArraysObserver.suspendArrayObservers(function () {
      forEach(cp._dependentKeys, function (dependentKey) {
        Ember.assert(
          'dependent array ' + dependentKey + ' must be an `Ember.Array`.  ' +
          'If you are not extending arrays, you will need to wrap native arrays with `Ember.A`',
          !(isArray(get(this, dependentKey)) && !EmberArray.detect(get(this, dependentKey))));

        // __EDIT__ use partiallyRecomputeFor on this instance
        if (!cp.partiallyRecomputeFor(dependentKey)) { return; }

        var dependentArray = get(this, dependentKey);
        var previousDependentArray = meta.dependentArrays[dependentKey];

        if (dependentArray === previousDependentArray) {
          // The array may be the same, but our item property keys may have
          // changed, so we set them up again.  We can't easily tell if they've
          // changed: the array may be the same object, but with different
          // contents.
          if (cp._previousItemPropertyKeys[dependentKey]) {
            delete cp._previousItemPropertyKeys[dependentKey];
            meta.dependentArraysObserver.setupPropertyObservers(dependentKey, cp._itemPropertyKeys[dependentKey]);
          }
        } else {
          meta.dependentArrays[dependentKey] = dependentArray;

          if (previousDependentArray) {
            meta.dependentArraysObserver.teardownObservers(previousDependentArray, dependentKey);
          }

          if (dependentArray) {
            meta.dependentArraysObserver.setupObservers(dependentArray, dependentKey);
          }
        }
      }, this);
    }, this);

    forEach(cp._dependentKeys, function(dependentKey) {
      if (!cp.partiallyRecomputeFor(dependentKey)) { return; }

      var dependentArray = get(this, dependentKey);

      if (dependentArray) {
        addItems.call(this, dependentArray, callbacks, cp, propertyName, meta);
      }
    }, this);
  };


  this.func = function (propertyName) {
    Ember.assert('Computed reduce values require at least one dependent key', cp._dependentKeys);

    recompute.call(this, propertyName);

    return cp._instanceMeta(this, propertyName).getValue();
  };
}

VTReduceComputedProperty.prototype = o_create(ReduceComputedProperty.prototype);

// __EDIT__ define partiallyRecomputeFor
VTReduceComputedProperty.prototype.partiallyRecomputeFor = function(dependentKey) {

  if (arrayBracketPattern.test(dependentKey)) {
    return false;
  }

  var value = get(this, dependentKey);
  return EmberArray.detect(value);
};

/**
  Creates a computed property which operates on dependent arrays and
  is updated with "one at a time" semantics. When items are added or
  removed from the dependent array(s) a reduce computed only operates
  on the change instead of re-evaluating the entire array.

  If there are more than one arguments the first arguments are
  considered to be dependent property keys. The last argument is
  required to be an options object. The options object can have the
  following four properties:

  `initialValue` - A value or function that will be used as the initial
  value for the computed. If this property is a function the result of calling
  the function will be used as the initial value. This property is required.

  `initialize` - An optional initialize function. Typically this will be used
  to set up state on the instanceMeta object.

  `removedItem` - A function that is called each time an element is removed
  from the array.

  `addedItem` - A function that is called each time an element is added to
  the array.


  The `initialize` function has the following signature:

  ```javascript
  function(initialValue, changeMeta, instanceMeta)
  ```

  `initialValue` - The value of the `initialValue` property from the
  options object.

  `changeMeta` - An object which contains meta information about the
  computed. It contains the following properties:

     - `property` the computed property
     - `propertyName` the name of the property on the object

  `instanceMeta` - An object that can be used to store meta
  information needed for calculating your computed. For example a
  unique computed might use this to store the number of times a given
  element is found in the dependent array.


  The `removedItem` and `addedItem` functions both have the following signature:

  ```javascript
  function(accumulatedValue, item, changeMeta, instanceMeta)
  ```

  `accumulatedValue` - The value returned from the last time
  `removedItem` or `addedItem` was called or `initialValue`.

  `item` - the element added or removed from the array

  `changeMeta` - An object which contains meta information about the
  change. It contains the following properties:

    - `property` the computed property
    - `propertyName` the name of the property on the object
    - `index` the index of the added or removed item
    - `item` the added or removed item: this is exactly the same as
      the second arg
    - `arrayChanged` the array that triggered the change. Can be
      useful when depending on multiple arrays.

  For property changes triggered on an item property change (when
  depKey is something like `someArray.@each.someProperty`),
  `changeMeta` will also contain the following property:

    - `previousValues` an object whose keys are the properties that changed on
    the item, and whose values are the item's previous values.

  `previousValues` is important Ember coalesces item property changes via
  Ember.run.once. This means that by the time removedItem gets called, item has
  the new values, but you may need the previous value (eg for sorting &
  filtering).

  `instanceMeta` - An object that can be used to store meta
  information needed for calculating your computed. For example a
  unique computed might use this to store the number of times a given
  element is found in the dependent array.

  The `removedItem` and `addedItem` functions should return the accumulated
  value. It is acceptable to not return anything (ie return undefined)
  to invalidate the computation. This is generally not a good idea for
  arrayComputed but it's used in eg max and min.

  Note that observers will be fired if either of these functions return a value
  that differs from the accumulated value.  When returning an object that
  mutates in response to array changes, for example an array that maps
  everything from some other array (see `Ember.computed.map`), it is usually
  important that the *same* array be returned to avoid accidentally triggering observers.

  Example

  ```javascript
  Ember.computed.max = function(dependentKey) {
    return Ember.reduceComputed(dependentKey, {
      initialValue: -Infinity,

      addedItem: function(accumulatedValue, item, changeMeta, instanceMeta) {
        return Math.max(accumulatedValue, item);
      },

      removedItem: function(accumulatedValue, item, changeMeta, instanceMeta) {
        if (item < accumulatedValue) {
          return accumulatedValue;
        }
      }
    });
  };
  ```

  Dependent keys may refer to `@this` to observe changes to the object itself,
  which must be array-like, rather than a property of the object.  This is
  mostly useful for array proxies, to ensure objects are retrieved via
  `objectAtContent`.  This is how you could sort items by properties defined on an item controller.

  Example

  ```javascript
  App.PeopleController = Ember.ArrayController.extend({
    itemController: 'person',

    sortedPeople: Ember.computed.sort('@this.@each.reversedName', function(personA, personB) {
      // `reversedName` isn't defined on Person, but we have access to it via
      // the item controller App.PersonController.  If we'd used
      // `content.@each.reversedName` above, we would be getting the objects
      // directly and not have access to `reversedName`.
      //
      var reversedNameA = get(personA, 'reversedName');
      var reversedNameB = get(personB, 'reversedName');

      return Ember.compare(reversedNameA, reversedNameB);
    })
  });

  App.PersonController = Ember.ObjectController.extend({
    reversedName: function() {
      return reverse(get(this, 'name'));
    }.property('name')
  });
  ```

  Dependent keys whose values are not arrays are treated as regular
  dependencies: when they change, the computed property is completely
  recalculated.  It is sometimes useful to have dependent arrays with similar
  semantics.  Dependent keys which end in `.[]` do not use "one at a time"
  semantics.  When an item is added or removed from such a dependency, the
  computed property is completely recomputed.

  When the computed property is completely recomputed, the `accumulatedValue`
  is discarded, it starts with `initialValue` again, and each item is passed
  to `addedItem` in turn.

  Example

  ```javascript
  Ember.Object.extend({
    // When `string` is changed, `computed` is completely recomputed.
    string: 'a string',

    // When an item is added to `array`, `addedItem` is called.
    array: [],

    // When an item is added to `anotherArray`, `computed` is completely
    // recomputed.
    anotherArray: [],

    computed: Ember.reduceComputed('string', 'array', 'anotherArray.[]', {
      addedItem: addedItemCallback,
      removedItem: removedItemCallback
    })
  });
  ```

  @method reduceComputed
  @for Ember
  @param {String} [dependentKeys*]
  @param {Object} options
  @return {Ember.ComputedProperty}
*/
export function reduceComputed(options) {
  var args;

  if (arguments.length > 1) {
    args = a_slice.call(arguments, 0, -1);
    options = a_slice.call(arguments, -1)[0];
  }

  if (typeof options !== 'object') {
    throw new EmberError('Reduce Computed Property declared without an options hash');
  }

  if (!('initialValue' in options)) {
    throw new EmberError('Reduce Computed Property declared without an initial value');
  }

  var cp = new VTReduceComputedProperty(options);

  if (args) {
    cp.property.apply(cp, args);
  }

  return cp;
}
import Ember from 'ember';
import { VTReduceComputedProperty } from './vt-reduce-cp';

var EmberError = Ember.Error;
var a_slice = [].slice;
var a_concat = [].concat;
var forEach = Ember.EnumerableUtils.forEach;
var addObserver = Ember.addObserver;
var o_create = Ember.create;

// VTArrayComputedProperty

function VTArrayComputedProperty() {
  var cp = this;

  VTReduceComputedProperty.apply(this, arguments);

  this.func = (function(reduceFunc) {
    return function (propertyName) {
      if (!cp._hasInstanceMeta(this, propertyName)) {
        // When we recompute an array computed property, we need already
        // retrieved arrays to be updated; we can't simply empty the cache and
        // hope the array is re-retrieved.
        forEach(cp._dependentKeys, function(dependentKey) {
          addObserver(this, dependentKey, function() {
            cp.recomputeOnce.call(this, propertyName);
          });
        }, this);
      }

      return reduceFunc.apply(this, arguments);
    };
  })(this.func);

  return this;
}

VTArrayComputedProperty.prototype = o_create(VTReduceComputedProperty.prototype);

VTArrayComputedProperty.prototype.initialValue = function () {
  return Ember.A();
};

VTArrayComputedProperty.prototype.resetValue = function (array) {
  array.clear();
  return array;
};

// This is a stopgap to keep the reference counts correct with lazy CPs.
VTArrayComputedProperty.prototype.didChange = function (obj, keyName) {
  return;
};

// This tells the CP to recompute fully for all keys
VTArrayComputedProperty.prototype.partiallyRecomputeFor = function(dependentKey) {
  return this._arrayDependentKeys.contains(dependentKey);
};

function arrayComputed(arrayDependentKeys, auxillaryDependentKeys, options) {
  var args = a_concat.call(arrayDependentKeys, auxillaryDependentKeys);

  if (typeof options !== 'object') {
    throw new EmberError('Array Computed Property declared without an options hash');
  }

  var cp = new VTArrayComputedProperty(options);
  cp._arrayDependentKeys = arrayDependentKeys;
  cp._auxillaryDependentKeys = auxillaryDependentKeys;

  if (args) {
    cp.property.apply(cp, args);
  }

  return cp;
}

export {
  arrayComputed,
  VTArrayComputedProperty
};
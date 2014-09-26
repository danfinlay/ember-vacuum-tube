import Ember from 'ember';
import { arrayComputed } from './vt-array-cp';

var a_slice = [].slice;
var SubArray = Ember.SubArray;
var forEach = Ember.EnumerableUtils.forEach;
var addObserver = Ember.addObserver;

// var ComputedProperty = Ember.ComputedProperty;
// var EmberError = Ember.Error;
// var TrackedArray = Ember.TrackedArray;
// var EmberArray = Ember.EmberArray;
// var run = Ember.run;
// var isArray = Ember.isArray;
// var a_slice = [].slice;
// var o_create = Ember.create;
// var e_get = Ember.get;
// var guidFor = Ember.guidFor;
// var metaFor = Ember.meta;
// var cacheFor = Ember.cacheFor;
// var propertyWillChange = Ember.propertyWillChange;
// var propertyDidChange = Ember.propertyDidChange;
// var removeObserver = Ember.removeObserver;
// var addBeforeObserver = Ember.addBeforeObserver;
// var removeBeforeObserver = Ember.removeBeforeObserver;
// var cacheSet = cacheFor.set;
// var cacheGet = cacheFor.get;
// var cacheRemove = cacheFor.remove;

// import Ember from 'ember-metal/core'; // Ember.assert
// import merge from 'ember-metal/merge';
// import { get } from 'ember-metal/property_get';
// import {
//   isArray,
//   guidFor
// } from 'ember-metal/utils';
// import EmberError from 'ember-metal/error';
// import {
//   forEach
// } from 'ember-metal/enumerable_utils';
// import run from 'ember-metal/run_loop';
// import { addObserver } from 'ember-metal/observer';
// import { arrayComputed } from 'ember-runtime/computed/array_computed';
// import { reduceComputed } from 'ember-runtime/computed/reduce_computed';
// import ObjectProxy from 'ember-runtime/system/object_proxy';
// import SubArray from 'ember-runtime/system/subarray';
// import keys from 'ember-metal/keys';
// import compare from 'ember-runtime/compare';

// vacuum tube - filter

/**
  Filters the array by the callback.

  The callback method you provide should have the following signature.
  `item` is the current item in the iteration.
  `index` is the integer index of the current item in the iteration.

  ```javascript
  function(item, index);
  ```

  ```javascript
    remainingChores: Ember.computed.filter('dependentArray', 'additonalDk' ... , function(item, index) {
      // return truthy to include
    })
  ```
*/

export default function filter() {
  var callback = arguments[arguments.length-1];
  var arrayDependentKeys = a_slice.call(arguments, 0, 1);
  var auxillaryDependentKeys = a_slice.call(arguments, 1, -1);
  var options = {

    initialize: function (array, changeMeta, instanceMeta) {
      var cp = changeMeta.property;
      forEach(auxillaryDependentKeys, function(dependentKey) {
        addObserver(this, dependentKey, this, function() {
          cp.recomputeOnce();
        });
      }, this);

      instanceMeta.filteredArrayIndexes = new SubArray();
    },

    addedItem: function (array, item, changeMeta, instanceMeta) {
      var match = !!callback.call(this, item, changeMeta.index);
      var filterIndex = instanceMeta.filteredArrayIndexes.addItem(changeMeta.index, match);

      if (match) {
        array.insertAt(filterIndex, item);
      }

      return array;
    },

    removedItem: function(array, item, changeMeta, instanceMeta) {
      var filterIndex = instanceMeta.filteredArrayIndexes.removeItem(changeMeta.index);

      if (filterIndex > -1) {
        array.removeAt(filterIndex);
      }

      return array;
    }
  };

  return arrayComputed(arrayDependentKeys, auxillaryDependentKeys, options);
}
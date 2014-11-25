var bigcheck = (function () {
  var exports = {};

  function isInteger(n) {
    return n === +n && n === (n|0);
  }

  // GENERATORS

  function resize(size) {
    return size; // TODO
  }

  function rebias(bias) {
    return bias; // TODO
  }

  function Generator(grow, shrink) {
    this.grow = grow; // size -> Shrinkable
    this.shrink = shrink; // value, bias -> Shrinkable
  }

  var integer = new Generator(
    function numberGrow(size) {
      return Math.floor(size * ((Math.random() * 2) - 1));
    },
    function numberShrink(value, bias) {
      if (Math.random() < bias) {
        return 0;
      } else {
        return Math.floor(value * ((Math.random() * 2) - 1));
      }
    }
  );

  var number = new Generator(
    function numberGrow(size) {
      return size * ((Math.random() * 2) - 1);
    },
    function numberShrink(value, bias) {
      if (isInteger(value)) {
        return integer.shrink(value, bias);
      } else if (Math.random() < bias) {
        return Math.floor(value);
      } else {
        return value * ((Math.random() * 2) - 1);
      }
    });

  function array(elem, length) {
    return new Generator(
      function arrayGrow(size) {
        var len = length || Math.random() * size;
        var value = [];
        for (var i = 0; i < len; i++) {
          value[i] = elem.grow(resize(size));
        }
        return value;
      },
      function arrayShrink(value, bias) {
        if ((value.length === 0) || ((length === undefined) && (Math.random() < bias))) {
          return [];
        } else {
          var newValue = value.slice();
          var i = Math.floor(Math.random() * newValue.length);
          if ((length === undefined) && (Math.random() < 0.5)) {
            newValue.splice(i, 1);
          } else {
            newValue[i] = elem.shrink(newValue[i], rebias(bias));
          }
          return newValue;
        }
      });
  }

  function tuple(elems) {
    return new Generator(
      function tupleGrow(size) {
        var len = elems.length;
        var value = [];
        for (var i = 0; i < len; i++) {
          value[i] = elems[i].grow(resize(size));
        }
        return value;
      },
      function tupleShrink(value, bias) {
        var newValue = value.slice();
        var i = Math.floor(Math.random() * newValue.length);
        newValue[i] = elems[i].shrink(newValue[i], rebias(bias));
        return newValue;
      });
  }

  function ordinal(min, max) {
    return new Generator(
      function ordinalGrow(size) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      },
      function ordinalShrink(value, bias) {
        if (Math.random() < bias) {
          return min;
        } else {
          return Math.floor(Math.random() * (value - min + 1)) + min;
        }
      });
  }

  function map(elems, to, from) {
    forall('check map', elems,
           // FIXME get rid of underscore dependency
           function(e) { return _.isEqual(from(to(e)), e); }).assert();
    return new Generator(
      function mapGrow(size) {
        return to(elems.grow(size));
      },
      function mapShrink(value, bias) {
        return to(elems.shrink(from(value), bias));
      }
    );
  }

  var value = integer; // TODO any valid eve value

  function facts(numColumns) {
    return array(array(value, numColumns));
  }

  // PROPERTIES

  function Success(numTests, options, prop) {
    this.numTests = numTests;
    this.options = options;
    this.prop = prop;
  }

  function Failure(size, numTests, numShrinks, shrunkInput, shrunkOutput, input, output, options, prop) {
    exports.lastFailure = this;
    this.size = size;
    this.numTests = numTests;
    this.numShrinks = numShrinks;
    this.shrunkInput = shrunkInput;
    this.shrunkOutput = shrunkOutput;
    this.inputs = input;
    this.output = output;
    this.options = options;
    this.prop = prop;
  }

  function ForAll(name, gen, fun) {
    this.name = name;
    this.gen = gen;
    this.fun = fun;
  }

  function forall(name, gen, fun) {
    return new ForAll(name, gen, fun);
  }

  function foralls() {
    var gens = Array.prototype.slice.call(arguments);
    var name = gens.shift();
    var fun = gens.pop();
    var gen = tuple(gens);
    return new ForAll(name, gen, function (values) {return fun.apply(null, values)});
  }

  ForAll.prototype = {
    check: function (options) {
      console.info("Testing: " + this.name);
      console.time(this.name);

      options = options || {};

      var numTests = 0;
      var maxTests = options.maxTests || 100;
      var maxSize = options.maxSize || maxTests;
      var input;
      var output;

      while (true) {
        var size = maxSize * (numTests / maxTests);
        input = this.gen.grow(size);
        try {
          output = this.fun.call(null, input);
        } catch (exception) {
          output = exception;
        }
        if (output !== true) break;
        numTests += 1;
        if (numTests >= maxTests) {
          console.timeEnd(this.name);
          return new Success(numTests, options, this);
        }
      }

      var numShrinks = 0;
      var maxShrinks = options.maxShrinks || (2 * maxTests);
      var bias = options.bias || 0.25; // TODO grow/shrink bias
      var shrunkInput = input;
      var shrunkOutput;

      while (true) {
        var tryInput = this.gen.shrink(shrunkInput, bias);
        var tryOutput;
        try {
          tryOutput = this.fun.call(null, tryInput);
        } catch (exception) {
          tryOutput = exception;
        }
        if (tryOutput !== true) {
          shrunkInput = tryInput;
          shrunkOutput = tryOutput;
        }
        numShrinks += 1;
        if (numShrinks >= maxShrinks) {
          console.timeEnd(this.name);
          return new Failure(size, numTests, numShrinks, shrunkInput, shrunkOutput, input, output, options, this);
        }
      }
    },

    assert: function(options) {
      var result = this.check(options);
      if (result instanceof Failure) {
        if (result.output instanceof Error) result.output = result.output.toString(); // Errors don't JSONify nicely
        throw new Error(JSON.stringify(result));
      } else {
        return result;
      }
    },

    recheck: function(input) {
      var input = input || exports.lastFailure.shrunkInput;
      if (input) {
        return this.fun.call(null, input);
      } else {
        return true;
      }
    }
  };

  // TESTS

  //   foralls("sum", number, number,
  //          function (a, b) {
  //            return (a + b) >= a;
  //          }).assert();

  // foralls("random tuple failure", array(tuple([number, number, number])),
  //        function(_) {
  //          return Math.random() < 0.999;
  //        }).check({maxTests: 10000, maxShrinks: 20000, bias: 0});

  // foralls("random array failure", array(array(number)),
  //        function(_) {
  //          return Math.random() < 0.999;
  //        }).check({maxTests: 10000, maxShrinks: 20000, bias: 0});

  // foralls("arrays are not strictly sorted", array(number, 9),
  //        function(nums) {
  //          for (var i = 0; i < nums.length - 1; i++) {
  //            if (nums[i] >= nums[i+1]) return true;
  //          }
  //          return false;
  //        }).check({maxTests: 10000000, maxShrinks: 20000000, bias: 0});

  exports = {number: number, integer: integer, array: array, tuple: tuple, value: value, facts: facts, forall: forall, foralls: foralls, map: map};

  if (typeof module !== 'undefined' && module.exports) { // node.js
    module.exports = exports;
  } else { // browser
    this.bigcheck = exports;
  }

  return exports;
})();

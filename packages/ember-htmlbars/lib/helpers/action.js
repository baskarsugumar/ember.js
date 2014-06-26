import Ember from "ember-metal/core"; // Handlebars, uuid, FEATURES, assert, deprecate
import { get } from "ember-metal/property_get";
import ControllerMixin from "ember-runtime/mixins/controller";
import { forEach } from "ember-metal/array";
import { uuid } from "ember-metal/utils";
import run from "ember-metal/run_loop";

import { isSimpleClick } from "ember-views/system/utils";

import { ActionHelper as HandlebarsActionHelper } from "ember-routing-handlebars/helpers/action";

/**
@module ember
@submodule ember-routing
*/

var a_slice = Array.prototype.slice;

function args(options, actionName) {
  var ret = [];
  var params = options.params;

  if (actionName) { ret.push(actionName); }

  for (var i = 0, l = params.length; i < l; i++) {
    var value, param = params[i];
    if (param.isLazyValue) {
      value = param.value();
    } else {
      value = param;
    }
    ret.push(unwrap(value));
  }

  return ret;
}

// HTMLBARS-TODO: Do we need to support model unwrapping?
function unwrap(object) {
  if (ControllerMixin.detect(object)) {
    return unwrap(get(object, 'model'));
  } else {
    return object;
  }
}

var ActionHelper = {};

export { ActionHelper };

var keys = ["alt", "shift", "meta", "ctrl"];

var POINTER_EVENT_TYPE_REGEX = /^click|mouse|touch/;

var isAllowedEvent = function(event, allowedKeys) {
  if (typeof allowedKeys === "undefined") {
    if (POINTER_EVENT_TYPE_REGEX.test(event.type)) {
      return isSimpleClick(event);
    } else {
      allowedKeys = '';
    }
  }

  if (allowedKeys.indexOf("any") >= 0) {
    return true;
  }

  var allowed = true;

  forEach.call(keys, function(key) {
    if (event[key + "Key"] && allowedKeys.indexOf(key) === -1) {
      allowed = false;
    }
  });

  return allowed;
};

ActionHelper.registerAction = function(actionNameOrPath, options, allowedKeys, env) {
  var hooks = env.hooks;
  var actionId = uuid();

  HandlebarsActionHelper.registeredActions[actionId] = {
    eventName: options.eventName,
    handler: function handleRegisteredAction(event) {
      if (!isAllowedEvent(event, allowedKeys)) { return true; }

      if (options.preventDefault !== false) {
        event.preventDefault();
      }

      if (options.bubbles === false) {
        event.stopPropagation();
      }

      var target = options.target,
          parameters = options.parameters,
          actionName;

      if (target.target) {
        target = target.stream.value();
      } else {
        target = target.root;
      }

      if (actionNameOrPath.isLazyValue) {
        actionName = actionNameOrPath.value();

        // HTMLBARS-TODO: Fix error case
        if(typeof actionName === 'undefined' || typeof actionName === 'function') {
          Ember.assert("You specified a quoteless path to the {{action}} helper '" + actionNameOrPath + "' which did not resolve to an actionName. Perhaps you meant to use a quoted actionName? (e.g. {{action '" + actionNameOrPath + "'}}).", true);
          actionName = actionNameOrPath;
        }
      }

      if (!actionName) {
        actionName = actionNameOrPath;
      }

      run(function runRegisteredAction() {
        if (target.send) {
          target.send.apply(target, args(parameters, actionName));
        } else {
          Ember.assert("The action '" + actionName + "' did not exist on " + target, typeof target[actionName] === 'function');
          target[actionName].apply(target, args(parameters));
        }
      });
    }
  };

  options.view.on('willClearRender', function() {
    var target = options.target;
    if (target && target.isLazyValue) {
      target.destroy();
    }

    delete HandlebarsActionHelper.registeredActions[actionId];
  });

  return actionId;
};

/**
  The `{{action}}` helper registers an HTML element within a template for DOM
  event handling and forwards that interaction to the templates's controller
  or supplied `target` option (see 'Specifying a Target').

  If the controller does not implement the event, the event is sent
  to the current route, and it bubbles up the route hierarchy from there.

  User interaction with that element will invoke the supplied action name on
  the appropriate target. Specifying a non-quoted action name will result in
  a bound property lookup at the time the event will be triggered.

  Given the following application Handlebars template on the page

  ```handlebars
  <div {{action 'anActionName'}}>
    click me
  </div>
  ```

  And application code

  ```javascript
  App.ApplicationController = Ember.Controller.extend({
    actions: {
      anActionName: function() {
      }
    }
  });
  ```

  Will result in the following rendered HTML

  ```html
  <div class="ember-view">
    <div data-ember-action="1">
      click me
    </div>
  </div>
  ```

  Clicking "click me" will trigger the `anActionName` action of the
  `App.ApplicationController`. In this case, no additional parameters will be passed.

  If you provide additional parameters to the helper:

  ```handlebars
  <button {{action 'edit' post}}>Edit</button>
  ```

  Those parameters will be passed along as arguments to the JavaScript
  function implementing the action.

  ### Event Propagation

  Events triggered through the action helper will automatically have
  `.preventDefault()` called on them. You do not need to do so in your event
  handlers. If you need to allow event propagation (to handle file inputs for
  example) you can supply the `preventDefault=false` option to the `{{action}}` helper:

  ```handlebars
  <div {{action "sayHello" preventDefault=false}}>
    <input type="file" />
    <input type="checkbox" />
  </div>
  ```

  To disable bubbling, pass `bubbles=false` to the helper:

  ```handlebars
  <button {{action 'edit' post bubbles=false}}>Edit</button>
  ```

  If you need the default handler to trigger you should either register your
  own event handler, or use event methods on your view class. See [Ember.View](/api/classes/Ember.View.html)
  'Responding to Browser Events' for more information.

  ### Specifying DOM event type

  By default the `{{action}}` helper registers for DOM `click` events. You can
  supply an `on` option to the helper to specify a different DOM event name:

  ```handlebars
  <div {{action "anActionName" on="doubleClick"}}>
    click me
  </div>
  ```

  See `Ember.View` 'Responding to Browser Events' for a list of
  acceptable DOM event names.

  NOTE: Because `{{action}}` depends on Ember's event dispatch system it will
  only function if an `Ember.EventDispatcher` instance is available. An
  `Ember.EventDispatcher` instance will be created when a new `Ember.Application`
  is created. Having an instance of `Ember.Application` will satisfy this
  requirement.

  ### Specifying whitelisted modifier keys

  By default the `{{action}}` helper will ignore click event with pressed modifier
  keys. You can supply an `allowedKeys` option to specify which keys should not be ignored.

  ```handlebars
  <div {{action "anActionName" allowedKeys="alt"}}>
    click me
  </div>
  ```

  This way the `{{action}}` will fire when clicking with the alt key pressed down.

  Alternatively, supply "any" to the `allowedKeys` option to accept any combination of modifier keys.

  ```handlebars
  <div {{action "anActionName" allowedKeys="any"}}>
    click me with any key pressed
  </div>
  ```

  ### Specifying a Target

  There are several possible target objects for `{{action}}` helpers:

  In a typical Ember application, where views are managed through use of the
  `{{outlet}}` helper, actions will bubble to the current controller, then
  to the current route, and then up the route hierarchy.

  Alternatively, a `target` option can be provided to the helper to change
  which object will receive the method call. This option must be a path
  to an object, accessible in the current context:

  ```handlebars
  {{! the application template }}
  <div {{action "anActionName" target=view}}>
    click me
  </div>
  ```

  ```javascript
  App.ApplicationView = Ember.View.extend({
    actions: {
      anActionName: function(){}
    }
  });

  ```

  ### Additional Parameters

  You may specify additional parameters to the `{{action}}` helper. These
  parameters are passed along as the arguments to the JavaScript function
  implementing the action.

  ```handlebars
  {{#each person in people}}
    <div {{action "edit" person}}>
      click me
    </div>
  {{/each}}
  ```

  Clicking "click me" will trigger the `edit` method on the current controller
  with the value of `person` as a parameter.

  @method action
  @for Ember.Handlebars.helpers
  @param {String} actionName
  @param {Object} [context]*
  @param {Hash} options
*/
export function actionHelper(element, params, options, env) {
  var actionName = params[0];
  var contexts = params.slice(1);

  var hash = options.hash,
      controller = env.data.keywords.controller;

  // create a hash to pass along to registerAction
  var action = {
    eventName: hash.on || "click",
    parameters: {
      context: options.context,
      options: env,
      params: contexts
    },
    view: env.data.view,
    bubbles: hash.bubbles,
    preventDefault: hash.preventDefault,
    target: { options: env },
    boundProperty: options.types[0] === "ID"
  };

  if (hash.target) {
    action.target.root = options.context;
    action.target.target = hash.target;
    action.target.stream = env.hooks.streamFor(options.context, hash.target);
  } else if (controller) {
    action.target.root = controller;
  }

  var actionId = ActionHelper.registerAction(actionName, action, hash.allowedKeys, env);
  element.setAttribute('data-ember-action', actionId);
}

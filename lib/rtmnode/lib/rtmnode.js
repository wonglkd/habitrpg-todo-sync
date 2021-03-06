var request = require('superagent'),
  md5 = require('MD5'),
  util = require('util'),
  url = require('url'),
  _ = require('underscore'),
  events = require('events'),
  argv = require('optimist')
    .alias('debug', 'verbose')
    .alias('debug', 'v')
    .argv;

function RtmNode(apiKey, sharedSecret) {
  // Privileged variables
  // TODO: Maybe don't force the format
  this.apiEndpoint = 'https://api.rememberthemilk.com/services/rest';
  this.apiKey = apiKey;
  this.sharedSecret = sharedSecret;
  this.authToken = undefined;
  this.defaultTimeline = undefined;

  // TODO: Pointless EventEmitter is pointless. You've shown you can use EventEmitter, so make this into a callback sometime.
  var rtmEmitter = new events.EventEmitter();
  this.emit = rtmEmitter.emit;
  this.on = rtmEmitter.on;

  // Privileged functions
  this.getSignature = function(queryParams) {
    // So we have an object representing our query string, yeah? And we have to put it in order and stuff. So first we get sorted keys.
    var sortedKeys = Object.keys(queryParams).sort();

    // K, now basically just iterate over the keys and concatenate the key and its value onto our string.
    var basisString = "";

    sortedKeys.forEach(function(item) {
      // Umm, let's see...queryParams[item] is the value, so...
      basisString += item;
      basisString += queryParams[item];
    });

    // MD5 it!
    return md5(this.sharedSecret + basisString);
  };

  this.defaultParameters = {
    format: "json",
    api_key: this.apiKey
  };

  // Initialize the timeline
  // TODO: Does this have to be at the end? I just want to make a sure a full RtmNode object is emitted.
  this.initializeTimeline = function() {
    var self = this;
    this.createTimeline(function(timeline) {
      self.defaultTimeline = this.defaultTimeline = timeline;
      // Emit a reference to the prepared object
      self.emit('RtmNodeReady', self);
    });
  };

  // TODO: Copied from getFrob
  this.createTimeline = function(callback) {
    var apiRequest = this.apiEndpoint;
    var timelineParams = _.clone(this.defaultParameters);
    timelineParams.method = "rtm.timelines.create";
    timelineParams.auth_token = this.authToken;
    timelineParams.api_sig = this.getSignature(timelineParams);

    request.get(apiRequest)
      .query(timelineParams)
      .type('application/json')
      .end(function(res) {
        if (res.ok) {
          res.text = JSON.parse(res.text);
        }
        if (res.ok && res.text.rsp.stat == "ok") {
          if (argv.debug) {
            console.log('Result from createTimeline: ' + util.inspect(res.text, {showHidden: true})); // TODO: Remove eventually
          }
          if (callback) {
            callback(res.text.rsp.timeline);
          }
        } else {
          console.log('Error in createTimeline: ' + util.inspect(res.text));
        }
      });
  };

  // TODO: This should be more generalized
  this.getFrob = function(existingFrob, callback) {
    if (!existingFrob) {
      var apiRequest = this.apiEndpoint;
      var frobParams = _.clone(this.defaultParameters);
      frobParams.method = "rtm.auth.getFrob";
      frobParams.api_sig = this.getSignature(frobParams);

      request.get(apiRequest)
        .query(frobParams)
        .type('application/json')
        .end(function(res) {
          if (res.ok) {
            res.text = JSON.parse(res.text);
          }
          if (res.ok && res.text.rsp.stat == "ok") {
            // console.log('Result from getFrob: ' + util.inspect(res.text, {showHidden: true})); // TODO: Remove eventually
            if (callback) {
              callback(res.text.rsp.frob);
            }
          } else {
            console.log('Error in getFrob: ' + util.inspect(res.text));
          }
        });
    } else {
      if (callback) {
        callback(existingFrob);
      }
    }
  };

  this.getAuthUrl = function(frob) {
    var authUrlObject = {
      protocol: "http",
      hostname: "www.rememberthemilk.com",
      pathname: "/services/auth",
      query: {
        api_key: this.apiKey,
        perms: "delete",
        frob: frob
      }
    };
    authUrlObject.query.api_sig = this.getSignature(authUrlObject.query);

    return url.format(authUrlObject);
  };

  // TODO: Copied and pasted from getFrob. Should instead refactor the common parts.
  this.getToken = function(frob, callback) {
    var apiRequest = this.apiEndpoint;
    var tokenParams = _.clone(this.defaultParameters);
    tokenParams.method = "rtm.auth.getToken";
    tokenParams.frob = frob;

    tokenParams.api_sig = this.getSignature(tokenParams);

    request.get(apiRequest)
      .query(tokenParams)
      .type('application/json')
      .end(function(res) {
        if (res.ok) {
          res.text = JSON.parse(res.text);
        }
        if (res.ok && res.text.rsp.stat == "ok") {
          // console.log('Result from getToken: ' + util.inspect(res.text, {showHidden: true})); // TODO: Remove eventually
          if (callback) {
            callback(res.text.rsp.auth.token);
          }
        } else {
          console.log('Error in getToken: ' + util.inspect(res.text));
        }
      });
  };

  this.setAuthToken = function(authToken) {
    this.authToken = authToken;
  };

  // TODO: Copy-pasted getToken. Should use a common request thingamajigger.
  this.checkToken = function(authToken, callback) {
    var apiRequest = this.apiEndpoint;
    var checkParams = _.clone(this.defaultParameters);
    checkParams.method = "rtm.auth.checkToken";
    checkParams.auth_token = authToken;

    checkParams.api_sig = this.getSignature(checkParams);

    request.get(apiRequest)
      .query(checkParams)
      .type('application/json')
      .end(function(res) {
        if (res.ok) {
          res.text = JSON.parse(res.text);
          // Failing is handled down the chain, so we don't have to check for "ok" in res.text.rsp.stat
          // console.log('Result from authToken: ' + util.inspect(res.text, {showHidden: true})); // TODO: Rem. event.
          if (callback) {
            if (res.text.rsp.stat == "fail") {
              callback(false);
            } else {
              callback(true);
            }
          }
        } else {
          console.log('Error in authToken: ' + util.inspect(res.text));
        }
      });
  };

  // At this point, this.authToken should already be set in the class
  this.getTasks = function(listId, filter, lastSync, callback) {
    var apiRequest = this.apiEndpoint;
    var taskParams = _.clone(this.defaultParameters);
    taskParams.method = "rtm.tasks.getList";
    taskParams.auth_token = this.authToken;

    if (listId) {
      taskParams.list_id = listId;
    }
    if (filter) {
      taskParams.filter = filter;
    }
    if (lastSync) {
      taskParams.last_sync = lastSync;
    }
    if (argv.debug) {
      // console.log('taskParams before getSignature: ' + util.inspect(taskParams));
    }
    taskParams.api_sig = this.getSignature(taskParams);

    request.get(apiRequest)
      .query(taskParams)
      .type('application/json')
      .end(function(res) {
        if (res.ok) {
          res.text = JSON.parse(res.text);
        }
        if (res.ok && res.text.rsp.stat == "ok") {
          // Failing is handled down the chain, so we don't have to check for "ok" in res.text.rsp.stat
          if (argv.debug) {
            console.log('Result from getTasks: ' + util.inspect(res.text, {showHidden: true}));
            console.log('rsp.tasks: ' + util.inspect(res.text.rsp.tasks, {showHidden: true}));
          }
          if (callback) {
            callback(res.text.rsp);
          }
        } else {
          console.log('Error in getTasks: ' + util.inspect(res.text));
        }
      });
  };

  // TODO: Copied from getTasks
  this.completeTask = function(listId, taskSeriesId, taskId, timelineId, callback) {
    if (!timelineId) {
      timelineId = this.defaultTimeline;
    }
    var apiRequest = this.apiEndpoint;
    var taskParams = _.clone(this.defaultParameters);
    taskParams.method = "rtm.tasks.complete";
    taskParams.auth_token = this.authToken;

    // Should throw exception if no timeline

    taskParams.timeline = timelineId;
    taskParams.list_id = listId;
    taskParams.taskseries_id = taskSeriesId;
    taskParams.task_id = taskId;

    if (argv.debug) {
      // console.log('taskParams before getSignature: ' + util.inspect(taskParams));
    }
    taskParams.api_sig = this.getSignature(taskParams);

    request.get(apiRequest)
      .query(taskParams)
      .type('application/json')
      .end(function(res) {
        if (res.ok) {
          res.text = JSON.parse(res.text);
        }
        if (res.ok && res.text.rsp.stat == "ok") {
          // Failing is handled down the chain, so we don't have to check for "ok" in res.text.rsp.stat
          if (argv.debug) {
            console.log('Result from completeTask: ' + util.inspect(res.text, {showHidden: true}));
            console.log('rsp.list: ' + util.inspect(res.text.rsp.list, {showHidden: true}));
          }
          if (callback) {
            callback(undefined, res.text.rsp.list);
          }
        } else {
          console.log('Error in completeTask: ' + util.inspect(res.text));
          if (callback) {
            callback(res.text, undefined);
          }
        }
      });
  };
}

module.exports = RtmNode;

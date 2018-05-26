/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2018 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Blockly编辑器中操作引发的事件的抽象类。
 */
'use strict';

goog.provide('Blockly.Events.Abstract');

goog.require('Blockly.Events');
goog.require('goog.array');
goog.require('goog.math.Coordinate');

/**
 * 事件的抽象类。
 * @constructor
 */
Blockly.Events.Abstract = function() {
  /**
   * 此事件的工作区标识符。
   * @type {string|undefined}
   */
  this.workspaceId = undefined;

  /**
   * 此事件所属组的事件组id。组定义事件，从用户的角度来看，这些事件应作为单个操作处理，并且应一起撤消。
   * @type {string}
   */
  this.group = Blockly.Events.group_;

  /**
   * 设置是否应将事件添加到撤消堆栈。
   * @type {boolean}
   */
  this.recordUndo = Blockly.Events.recordUndo;
};

/**
 * 将事件编码为JSON。
 * @return {!Object} JSON 表示.
 */
Blockly.Events.Abstract.prototype.toJson = function() {
  var json = {
    'type': this.type
  };
  if (this.group) {
    json['group'] = this.group;
  }
  return json;
};

/**
 * 对JSON事件进行解码。
 * @param {!Object} json JSON 表示.
 */
Blockly.Events.Abstract.prototype.fromJson = function(json) {
  this.group = json['group'];
};

/**
 * 此事件是否记录任何状态更改？
 * @return {boolean} 如果为空，则为true；如果有更改，则为false。
 */
Blockly.Events.Abstract.prototype.isNull = function() {
  return false;
};

/**
 * 运行事件。
 * @param {boolean} _forward 向前运行时为true，向后运行时为false (撤消)。
 */
Blockly.Events.Abstract.prototype.run = function(_forward) {
  // Defined by subclasses.
};

/**
 * 获取事件所属的工作区。
 * @return {Blockly.Workspace} 事件所属的工作区。
 * @throws {Error} 如果工作区为空。
 * @protected
 */
Blockly.Events.Abstract.prototype.getEventWorkspace_ = function() {
  var workspace = Blockly.Workspace.getById(this.workspaceId);
  if (!workspace) {
    throw Error('Workspace is null. Event must have been generated from real' +
      ' Blockly events.');
  }
  return workspace;
};

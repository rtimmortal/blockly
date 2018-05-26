/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2011 Google Inc.
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
 * @fileoverview The class representing one block.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.Block');

goog.require('Blockly.Blocks');
goog.require('Blockly.Comment');
goog.require('Blockly.Connection');
goog.require('Blockly.Events.BlockChange');
goog.require('Blockly.Events.BlockCreate');
goog.require('Blockly.Events.BlockDelete');
goog.require('Blockly.Events.BlockMove');
goog.require('Blockly.Extensions');
goog.require('Blockly.Input');
goog.require('Blockly.Mutator');
goog.require('Blockly.Warning');
goog.require('Blockly.Workspace');
goog.require('Blockly.Xml');
goog.require('goog.array');
goog.require('goog.asserts');
goog.require('goog.math.Coordinate');
goog.require('goog.string');


/**
 * 为一个块初始化。
 * 通常不直接调用，首选 workspace.newblock()
 * @param {!Blockly.Workspace} workspace 块的工作区
 * @param {?string} prototypeName 包含此块的特定类型函数的语言对象的名称。
 * @param {string=} opt_id 可选标识。如果提供了此 ID，请使用此 ID，否则请创建新 ID。
 * @constructor
 */
Blockly.Block = function(workspace, prototypeName, opt_id) {
  if (typeof Blockly.Generator.prototype[prototypeName] !== 'undefined') {
    console.warn('FUTURE ERROR: Block prototypeName "' + prototypeName
        + '" conflicts with Blockly.Generator members. Registering Generators '
        + 'for this block type will incur errors.'
        + '\nThis name will be DISALLOWED (throwing an error) in future '
        + 'versions of Blockly.');
  }

  /**
   * 积木全局唯一的 id
   * @type {string}
   **/
  this.id = (opt_id && !workspace.getBlockById(opt_id)) ?
      opt_id : Blockly.utils.genUid();
  workspace.blockDB_[this.id] = this;
  /**
   * @type {Blockly.Connection} UNKNOW: 这里应该是 Blockly.RenderedConnection
   */
  this.outputConnection = null;
  /**
   * @type {Blockly.Connection} UNKNOW: 这里应该是 Blockly.RenderedConnection
   */
  this.nextConnection = null;
  /**
   * @type {Blockly.Connection} UNKNOW: 这里应该是 Blockly.RenderedConnection
   */
  this.previousConnection = null;
  /**
   * @type {!Array.<!Blockly.Input>} 非空数组，里面有非空 Blockly.Input
   **/
  this.inputList = [];
  /**
   * 是否为单行 input
   * @type {boolean|undefined}
   */
  this.inputsInline = undefined;
  /**
   * UNKNOW: 积木是否禁用
   * @type {boolean}
   */
  this.disabled = false;
  /**
   * @type {string|!Function} 字符串或非空函数
   */
  this.tooltip = '';
  /**
   * 是否显示右键菜单
   * @type {boolean}
   */
  this.contextMenu = true;

  /**
   * 父块
   * @type {Blockly.Block}
   * @private
   */
  this.parentBlock_ = null;

  /**
   * 与此块相连接的积木
   * @type {!Array.<!Blockly.Block>}
   * @private
   */
  this.childBlocks_ = [];

  /**
   * 块是否可以被删除
   * @type {boolean}
   * @private
   */
  this.deletable_ = true;

  /**
   * 块是否可以被拖动
   * @type {boolean}
   * @private
   */
  this.movable_ = true;

  /**
   * UNKNOW: 块是否可以被编辑
   * @type {boolean}
   * @private
   */
  this.editable_ = true;

  /**
   * 块是否是阴影积木（可以被拖入的积木代替，本身不可拖出父积木）
   * @type {boolean}
   * @private
   */
  this.isShadow_ = false;

  /**
   * UNKNOW: 块当前是否为折叠状态
   * @type {boolean}
   * @private
   */
  this.collapsed_ = false;

  /**
   * @type {string|Blockly.Comment} 块绑定的注释
   */
  this.comment = null;

  /**
   * 块在工作区单位中的位置。(0, 0) 位于工作区的原点；比例不会更改此值。
   * @type {!goog.math.Coordinate}
   * @private
   */
  this.xy_ = new goog.math.Coordinate(0, 0);

  /**
   * 块所属于的工作区
   * @type {!Blockly.Workspace}
   */
  this.workspace = workspace;
  /**
   * 块是否在 flyout 中
   * @type {boolean}
   */
  this.isInFlyout = workspace.isFlyout;
  /**
   * UNKNOW: 是否在变异体？
   * @type {boolean}
   */
  this.isInMutator = workspace.isMutator;

  /**
   * Right To Left
   * @type {boolean}
   */
  this.RTL = workspace.RTL;

  // Copy the type-specific functions and data from the prototype.
  if (prototypeName) {
    /** @type {string} */
    this.type = prototypeName;
    var prototype = Blockly.Blocks[prototypeName];
    goog.asserts.assertObject(prototype,
        'Error: Unknown block type "%s".', prototypeName);
    goog.mixin(this, prototype);
  }

  workspace.addTopBlock(this);

  // Call an initialization function, if it exists.
  if (goog.isFunction(this.init)) {
    this.init();
  }
  /**
   * 记录初始内联状态
   * @type {boolean|undefined}
   */
  this.inputsInlineDefault = this.inputsInline;

  // Fire a create event.
  if (Blockly.Events.isEnabled()) {
    var existingGroup = Blockly.Events.getGroup();
    if (!existingGroup) {
      Blockly.Events.setGroup(true);
    }
    try {
      Blockly.Events.fire(new Blockly.Events.BlockCreate(this));
    } finally {
      if (!existingGroup) {
        Blockly.Events.setGroup(false);
      }
    }

  }
  // Bind an onchange function, if it exists.
  if (goog.isFunction(this.onchange)) {
    this.setOnChange(this.onchange);
  }
};

/**
 * 获取新创建的块
 * @param {!Blockly.Workspace} workspace 块的工作区
 * @param {?string} prototypeName 包含此块的特定类型函数的语言对象的名称
 * @return {!Blockly.Block} 创建的块
 * @deprecated 2015年12月被废弃使用
 */
Blockly.Block.obtain = function(workspace, prototypeName) {
  console.warn('Deprecated call to Blockly.Block.obtain, ' +
               'use workspace.newBlock instead.');
  return workspace.newBlock(prototypeName);
};

/**
 * 块与XML之间往返的可选文本数据。没有效果。可由第三方用于元信息
 * @type {?string}
 */
Blockly.Block.prototype.data = null;

/**
 * 块的颜色为'#RRGGBB'格式。
 * @type {string}
 * @private
 */
Blockly.Block.prototype.colour_ = '#000000';

/**
 * 块的颜色作为HSV色调值( 0 - 360 )
 * @type {?number}
 * @private
  */
Blockly.Block.prototype.hue_ = null;

/**
 * 把这个块处理掉
 * @param {boolean} healStack 如果为 true，则尝试通过将下一个语句与上一个语句连接来修复任何缺口。否则，处置该块的所有子块。
 */
Blockly.Block.prototype.dispose = function(healStack) {
  if (!this.workspace) {
    // Already deleted.
    return;
  }
  // Terminate onchange event calls.
  if (this.onchangeWrapper_) {
    this.workspace.removeChangeListener(this.onchangeWrapper_);
  }
  this.unplug(healStack);
  if (Blockly.Events.isEnabled()) {
    Blockly.Events.fire(new Blockly.Events.BlockDelete(this));
  }
  Blockly.Events.disable();

  try {
    // This block is now at the top of the workspace.
    // Remove this block from the workspace's list of top-most blocks.
    if (this.workspace) {
      this.workspace.removeTopBlock(this);
      // Remove from block database.
      delete this.workspace.blockDB_[this.id];
      this.workspace = null;
    }

    // Just deleting this block from the DOM would result in a memory leak as
    // well as corruption of the connection database.  Therefore we must
    // methodically step through the blocks and carefully disassemble them.

    // First, dispose of all my children.
    for (var i = this.childBlocks_.length - 1; i >= 0; i--) {
      this.childBlocks_[i].dispose(false);
    }
    // Then dispose of myself.
    // Dispose of all inputs and their fields.
    for (var i = 0, input; input = this.inputList[i]; i++) {
      input.dispose();
    }
    this.inputList.length = 0;
    // Dispose of any remaining connections (next/previous/output).
    var connections = this.getConnections_(true);
    for (var i = 0; i < connections.length; i++) {
      var connection = connections[i];
      if (connection.isConnected()) {
        connection.disconnect();
      }
      connections[i].dispose();
    }
  } finally {
    Blockly.Events.enable();
  }
};

/**
 * 对块上的所有字段调用initModel
 * 可以调用多次
 * 在创建块之后和与块的第一次交互之前，必须调用 initModel 或 initSvg
 * 交互包括 UI 操作(例如单击和拖动)和激发事件(例如创建、删除和更改)
 * @public
 */
Blockly.Block.prototype.initModel = function() {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.initModel) {
        field.initModel();
      }
    }
  }
};

/**
 * 从上级模块上拔下此模块。如果此块是语句，则可选地将下面的块与上面的块重新连接。
 * @param {boolean=} opt_healStack 断开子语句并重新连接堆栈。默认值为 false
 */
Blockly.Block.prototype.unplug = function(opt_healStack) {
  if (this.outputConnection) {
    if (this.outputConnection.isConnected()) {
      // Disconnect from any superior block.
      this.outputConnection.disconnect();
    }
  } else if (this.previousConnection) {
    var previousTarget = null;
    if (this.previousConnection.isConnected()) {
      // Remember the connection that any next statements need to connect to.
      previousTarget = this.previousConnection.targetConnection;
      // Detach this block from the parent's tree.
      this.previousConnection.disconnect();
    }
    var nextBlock = this.getNextBlock();
    if (opt_healStack && nextBlock) {
      // Disconnect the next statement.
      var nextTarget = this.nextConnection.targetConnection;
      nextTarget.disconnect();
      if (previousTarget && previousTarget.checkType_(nextTarget)) {
        // Attach the next statement to the previous statement.
        previousTarget.connect(nextTarget);
      }
    }
  }
};

/**
 * 返回源自此块的所有连接
 * @param {boolean} _all 如果为true，则返回所有连接，甚至是隐藏的连接
 * @return {!Array.<!Blockly.Connection>} 由 Connection 组成的数组
 * @private
 */
Blockly.Block.prototype.getConnections_ = function(_all) {
  var myConnections = [];
  if (this.outputConnection) {
    myConnections.push(this.outputConnection);
  }
  if (this.previousConnection) {
    myConnections.push(this.previousConnection);
  }
  if (this.nextConnection) {
    myConnections.push(this.nextConnection);
  }
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.connection) {
      myConnections.push(input.connection);
    }
  }
  return myConnections;
};

/**
 * 遍历一堆块并找到堆栈上的最后一个下一个连接
 * @return {Blockly.Connection} 堆栈上的最后一个连接，或 null
 * @package
 */
Blockly.Block.prototype.lastConnectionInStack_ = function() {
  var nextConnection = this.nextConnection;
  while (nextConnection) {
    var nextBlock = nextConnection.targetBlock();
    if (!nextBlock) {
      // Found a next connection with nothing on the other side.
      return nextConnection;
    }
    nextConnection = nextBlock.nextConnection;
  }
  // Ran out of next connections.
  return null;
};

/**
 * 将未连接的块撞出对齐。没有实际连接的两个块不应该在屏幕上同时对齐。
 * @private
 */
Blockly.Block.prototype.bumpNeighbours_ = function() {
  console.warn('Not expected to reach this bumpNeighbours_ function. The ' +
    'BlockSvg function for bumpNeighbours_ was expected to be called instead.');
};

/**
 * 返回父块，如果此块位于顶层，则返回null
 * @return {Blockly.Block} 顶上连接当前块的块
 */
Blockly.Block.prototype.getParent = function() {
  // Look at the DOM to see if we are nested in another block.
  return this.parentBlock_;
};

/**
 * 返回连接到指定块的输入
 * @param {!Blockly.Block} block 连接到此块上输入的块
 * @return {Blockly.Input} 连接到指定块的输入
 */
Blockly.Block.prototype.getInputWithBlock = function(block) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.connection && input.connection.targetBlock() == block) {
      return input;
    }
  }
  return null;
};

/**
 * 返回环绕当前块的父块，如果此块没有环绕块，则返回null。
 * 父块可能只是前一个语句，而周围的块是 if 语句、while 循环等。
 * @return {Blockly.Block} 围绕当前块的块
 */
Blockly.Block.prototype.getSurroundParent = function() {
  var block = this;
  do {
    var prevBlock = block;
    block = block.getParent();
    if (!block) {
      // Ran off the top.
      return null;
    }
  } while (block.getNextBlock() == prevBlock);
  // This block is an enclosing parent, not just a statement in a stack.
  return block;
};

/**
 * 返回直接连接到此块的下一个语句块
 * @return {Blockly.Block} 下一个语句块或空
 */
Blockly.Block.prototype.getNextBlock = function() {
  return this.nextConnection && this.nextConnection.targetBlock();
};

/**
 * 返回此块树中最上面的块
 * 如果此块位于顶层，则返回它自己
 * @return {!Blockly.Block} The root block.
 */
Blockly.Block.prototype.getRootBlock = function() {
  var rootBlock;
  var block = this;
  do {
    rootBlock = block;
    block = rootBlock.parentBlock_;
  } while (block);
  return rootBlock;
};

/**
 * 查找直接嵌套在此块中的所有块。
 * 包括值和块输入以及任何跟随的语句。
 * 排除输出选项卡上的任何连接或前面的任何语句。
 * @return {!Array.<!Blockly.Block>} 由块组成的数组.
 */
Blockly.Block.prototype.getChildren = function() {
  return this.childBlocks_;
};

/**
 * 将此块的父块设置为新块或 null
 * @param {Blockly.Block} newParent New parent block.
 */
Blockly.Block.prototype.setParent = function(newParent) {
  if (newParent == this.parentBlock_) {
    return;
  }
  if (this.parentBlock_) {
    // Remove this block from the old parent's child list.
    goog.array.remove(this.parentBlock_.childBlocks_, this);

    // Disconnect from superior blocks.
    if (this.previousConnection && this.previousConnection.isConnected()) {
      throw 'Still connected to previous block.';
    }
    if (this.outputConnection && this.outputConnection.isConnected()) {
      throw 'Still connected to parent block.';
    }
    this.parentBlock_ = null;
    // This block hasn't actually moved on-screen, so there's no need to update
    // its connection locations.
  } else {
    // Remove this block from the workspace's list of top-most blocks.
    this.workspace.removeTopBlock(this);
  }

  this.parentBlock_ = newParent;
  if (newParent) {
    // Add this block to the new parent's child list.
    newParent.childBlocks_.push(this);
  } else {
    this.workspace.addTopBlock(this);
  }
};

/**
 * 查找直接或间接嵌套在此块中的所有块
 * 将此块包括在列表中
 * 包括值和块输入以及任何语句
 * 排除输出选项卡上的任何连接或前面的任何语句
 * @return {!Array.<!Blockly.Block>} 拍平的块数组
 */
Blockly.Block.prototype.getDescendants = function() {
  var blocks = [this];
  for (var child, x = 0; child = this.childBlocks_[x]; x++) {
    blocks.push.apply(blocks, child.getDescendants());
  }
  return blocks;
};

/**
 * 获取此块是否可删除
 * @return {boolean} 如果可删除，则为 true
 */
Blockly.Block.prototype.isDeletable = function() {
  return this.deletable_ && !this.isShadow_ &&
      !(this.workspace && this.workspace.options.readOnly);
};

/**
 * 设置此块是否可删除
 * @param {boolean} deletable 如果可删除，则为 true
 */
Blockly.Block.prototype.setDeletable = function(deletable) {
  this.deletable_ = deletable;
};

/**
 * 获取此块是否可移动
 * @return {boolean} 如果可移动，则为 true
 */
Blockly.Block.prototype.isMovable = function() {
  return this.movable_ && !this.isShadow_ &&
      !(this.workspace && this.workspace.options.readOnly);
};

/**
 * 设置此块是否可移动
 * @param {boolean} movable 如果可移动，则为 true
 */
Blockly.Block.prototype.setMovable = function(movable) {
  this.movable_ = movable;
};

/**
 * 获取此块是否为阴影块
 * @return {boolean} true 若是影子块
 */
Blockly.Block.prototype.isShadow = function() {
  return this.isShadow_;
};

/**
 * 设置此块是否为阴影块
 * @param {boolean} shadow 真若是阴影块。
 */
Blockly.Block.prototype.setShadow = function(shadow) {
  this.isShadow_ = shadow;
};

/**
 * 获取此块是否可编辑
 * @return {boolean} 如果可编辑，则为 true
 */
Blockly.Block.prototype.isEditable = function() {
  return this.editable_ && !(this.workspace && this.workspace.options.readOnly);
};

/**
 * 设置此块是否可编辑
 * @param {boolean} editable 如果可编辑，则为 true
 */
Blockly.Block.prototype.setEditable = function(editable) {
  this.editable_ = editable;
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      field.updateEditable();
    }
  }
};

/**
 * 设置连接是否隐藏(不在数据库中跟踪)
 * 递归地遍历所有子块(折叠块除外)
 * @param {boolean} hidden 如果连接隐藏，则为 true
 */
Blockly.Block.prototype.setConnectionsHidden = function(hidden) {
  if (!hidden && this.isCollapsed()) {
    if (this.outputConnection) {
      this.outputConnection.setHidden(hidden);
    }
    if (this.previousConnection) {
      this.previousConnection.setHidden(hidden);
    }
    if (this.nextConnection) {
      this.nextConnection.setHidden(hidden);
      var child = this.nextConnection.targetBlock();
      if (child) {
        child.setConnectionsHidden(hidden);
      }
    }
  } else {
    var myConnections = this.getConnections_(true);
    for (var i = 0, connection; connection = myConnections[i]; i++) {
      connection.setHidden(hidden);
      if (connection.isSuperior()) {
        var child = connection.targetBlock();
        if (child) {
          child.setConnectionsHidden(hidden);
        }
      }
    }
  }
};

/**
 * 设置此块的帮助页的 URL
 * @param {string|Function} url 块帮助的 URL 字符串，或返回 URL 的函数。无帮助为空。
 */
Blockly.Block.prototype.setHelpUrl = function(url) {
  this.helpUrl = url;
};

/**
 * 更改块的工具提示文本
 * @param {string|!Function} newTip 工具提示的文本或要链接到其工具提示的父元素。可以是返回字符串的函数
 */
Blockly.Block.prototype.setTooltip = function(newTip) {
  this.tooltip = newTip;
};

/**
 * 得到块的颜色
 * @return {string} #RRGGBB
 */
Blockly.Block.prototype.getColour = function() {
  return this.colour_;
};

/**
 * 获取块的HSV色调值。如果未设置色调，则为空
 * @return {?number} 色调值(0-360)
 */
Blockly.Block.prototype.getHue = function() {
  return this.hue_;
};

/**
 * 更改块的颜色
 * @param {number|string} colour HSV 色调值(0 到 360)，#RRGGBB 字符串，或指向这两个值之一的消息引用字符串。
 */
Blockly.Block.prototype.setColour = function(colour) {
  var dereferenced = goog.isString(colour) ?
      Blockly.utils.replaceMessageReferences(colour) : colour;

  var hue = Number(dereferenced);
  if (!isNaN(hue) && 0 <= hue && hue <= 360) {
    this.hue_ = hue;
    this.colour_ = Blockly.hueToRgb(hue);
  } else if (goog.isString(dereferenced) &&
      /^#[0-9a-fA-F]{6}$/.test(dereferenced)) {
    this.colour_ = dereferenced;
    // Only store hue if colour is set as a hue.
    this.hue_ = null;
  } else {
    var errorMsg = 'Invalid colour: "' + dereferenced + '"';
    if (colour != dereferenced) {
      errorMsg += ' (from "' + colour + '")';
    }
    throw errorMsg;
  }
};

/**
 * 设置回调函数，以便在块的父工作区发生更改时使用，从而替换以前的任何 onchange 处理程序
 * 这通常只从构造函数、块类型初始值设定项函数或扩展初始值设定项函数调用
 * @param {function(Blockly.Events.Abstract)} onchangeFn 区块工作区变更时呼叫的回呼
 * @throws {Error} 如果 onchangeFn 不是假的或函数。
 */
Blockly.Block.prototype.setOnChange = function(onchangeFn) {
  if (onchangeFn && !goog.isFunction(onchangeFn)) {
    throw new Error("onchange must be a function.");
  }
  if (this.onchangeWrapper_) {
    this.workspace.removeChangeListener(this.onchangeWrapper_);
  }
  this.onchange = onchangeFn;
  if (this.onchange) {
    this.onchangeWrapper_ = onchangeFn.bind(this);
    this.workspace.addChangeListener(this.onchangeWrapper_);
  }
};

/**
 * 从块返回命名字段
 * @param {string} name 字段的名称
 * @return {Blockly.Field} 命名字段；如果字段不存在，则为空。
 */
Blockly.Block.prototype.getField = function(name) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.name === name) {
        return field;
      }
    }
  }
  return null;
};

/**
 * 返回此块引用的所有变量
 * @return {!Array.<string>} 变量名称组成的数组
 * @package
 */
Blockly.Block.prototype.getVars = function() {
  var vars = [];
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field instanceof Blockly.FieldVariable) {
        vars.push(field.getValue());
      }
    }
  }
  return vars;
};

/**
 * 返回此块引用的所有变量
 * @return {!Array.<!Blockly.VariableModel>} 由变量组成的数组
 * @package
 */
Blockly.Block.prototype.getVarModels = function() {
  var vars = [];
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field instanceof Blockly.FieldVariable) {
        var model = this.workspace.getVariableById(field.getValue());
        // Check if the variable actually exists (and isn't just a potential
        // variable).
        if (model) {
          vars.push(model);
        }
      }
    }
  }
  return vars;
};

/**
 * 通知变量正在重命名但保持相同的 ID
 * 如果此块上正在使用变量，请重新录制以显示新名称
 * @param {!Blockly.VariableModel} variable 要重命名的变量
 * @package
 */
Blockly.Block.prototype.updateVarName = function(variable) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field instanceof Blockly.FieldVariable &&
          variable.getId() == field.getValue()) {
        field.setText(variable.name);
      }
    }
  }
};

/**
 * 通知变量正在重命名
 * 如果ID与此块的变量之一匹配，重命名它
 * @param {string} oldId 要重命名的变量的 ID
 * @param {string} newId 新变量的标识。可能与 oldId 相同，但具有更新的名称
 */
Blockly.Block.prototype.renameVarById = function(oldId, newId) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field instanceof Blockly.FieldVariable &&
          oldId == field.getValue()) {
        field.setValue(newId);
      }
    }
  }
};

/**
 * 从块的字段返回字段值
 * @param {string} name 字段的名称
 * @return {?string} 字段中的值；如果字段不存在，则为空
 */
Blockly.Block.prototype.getFieldValue = function(name) {
  var field = this.getField(name);
  if (field) {
    return field.getValue();
  }
  return null;
};

/**
 * 更改块的字段值(例如“选择”或“删除”)。
 * @param {string} newValue 值作为新字段
 * @param {string} name 字段的名称
 */
Blockly.Block.prototype.setFieldValue = function(newValue, name) {
  var field = this.getField(name);
  goog.asserts.assertObject(field, 'Field "%s" not found.', name);
  field.setValue(newValue);
};

/**
 * 设置此块是否可以链接到另一个块的底部
 * @param {boolean} newBoolean 如果可以有上一个语句，则为 true
 * @param {(string|Array.<string>|null)=} opt_check 语句类型或语句类型列表。如果可以连接任何类型，则为空/未定义
 */
Blockly.Block.prototype.setPreviousStatement = function(newBoolean, opt_check) {
  if (newBoolean) {
    if (opt_check === undefined) {
      opt_check = null;
    }
    if (!this.previousConnection) {
      goog.asserts.assert(!this.outputConnection,
          'Remove output connection prior to adding previous connection.');
      this.previousConnection =
          this.makeConnection_(Blockly.PREVIOUS_STATEMENT);
    }
    this.previousConnection.setCheck(opt_check);
  } else {
    if (this.previousConnection) {
      goog.asserts.assert(!this.previousConnection.isConnected(),
          'Must disconnect previous statement before removing connection.');
      this.previousConnection.dispose();
      this.previousConnection = null;
    }
  }
};

/**
 * 设置其他块是否可以链接到此块的底部
 * @param {boolean} newBoolean 如果可以有下一个语句，则为 true
 * @param {(string|Array.<string>|null)=} opt_check 语句类型或语句类型列表。如果可以连接任何类型，则为空/未定义。
 */
Blockly.Block.prototype.setNextStatement = function(newBoolean, opt_check) {
  if (newBoolean) {
    if (opt_check === undefined) {
      opt_check = null;
    }
    if (!this.nextConnection) {
      this.nextConnection = this.makeConnection_(Blockly.NEXT_STATEMENT);
    }
    this.nextConnection.setCheck(opt_check);
  } else {
    if (this.nextConnection) {
      goog.asserts.assert(!this.nextConnection.isConnected(),
          'Must disconnect next statement before removing connection.');
      this.nextConnection.dispose();
      this.nextConnection = null;
    }
  }
};

/**
 * 设置此块是否返回值
 * @param {boolean} newBoolean 如果有输出，则为 true
 * @param {(string|Array.<string>|null)=} opt_check 返回类型或返回类型列表。如果可以返回任何类型(例如变量 get )，则为空或未定义
 */
Blockly.Block.prototype.setOutput = function(newBoolean, opt_check) {
  if (newBoolean) {
    if (opt_check === undefined) {
      opt_check = null;
    }
    if (!this.outputConnection) {
      goog.asserts.assert(!this.previousConnection,
          'Remove previous connection prior to adding output connection.');
      this.outputConnection = this.makeConnection_(Blockly.OUTPUT_VALUE);
    }
    this.outputConnection.setCheck(opt_check);
  } else {
    if (this.outputConnection) {
      goog.asserts.assert(!this.outputConnection.isConnected(),
          'Must disconnect output value before removing connection.');
      this.outputConnection.dispose();
      this.outputConnection = null;
    }
  }
};

/**
 * 设置值输入是水平排列还是垂直排列
 * @param {boolean} newBoolean 如果输入是水平的，则为 true
 */
Blockly.Block.prototype.setInputsInline = function(newBoolean) {
  if (this.inputsInline != newBoolean) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this, 'inline', null, this.inputsInline, newBoolean));
    this.inputsInline = newBoolean;
  }
};

/**
 * 获取值输入是水平排列还是垂直排列
 * @return {boolean} 如果输入是水平的，则为 true
 */
Blockly.Block.prototype.getInputsInline = function() {
  if (this.inputsInline != undefined) {
    // Set explicitly.
    return this.inputsInline;
  }
  // Not defined explicitly.  Figure out what would look best.
  for (var i = 1; i < this.inputList.length; i++) {
    if (this.inputList[i - 1].type == Blockly.DUMMY_INPUT &&
        this.inputList[i].type == Blockly.DUMMY_INPUT) {
      // Two dummy inputs in a row.  Don't inline them.
      return false;
    }
  }
  for (var i = 1; i < this.inputList.length; i++) {
    if (this.inputList[i - 1].type == Blockly.INPUT_VALUE &&
        this.inputList[i].type == Blockly.DUMMY_INPUT) {
      // Dummy input after a value input.  Inline them.
      return true;
    }
  }
  return false;
};

/**
 * Set whether the block is disabled or not.
 * @param {boolean} disabled True if disabled.
 */
Blockly.Block.prototype.setDisabled = function(disabled) {
  if (this.disabled != disabled) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this, 'disabled', null, this.disabled, disabled));
    this.disabled = disabled;
  }
};

/**
 * 获取块是否由于父级而禁用
 * 不考虑块本身的禁用属性
 * @return {boolean} 如果禁用，则为true
 */
Blockly.Block.prototype.getInheritedDisabled = function() {
  var ancestor = this.getSurroundParent();
  while (ancestor) {
    if (ancestor.disabled) {
      return true;
    }
    ancestor = ancestor.getSurroundParent();
  }
  // Ran off the top.
  return false;
};

/**
 * 获取块是否折叠
 * @return {boolean} 如果折叠，则为 true
 */
Blockly.Block.prototype.isCollapsed = function() {
  return this.collapsed_;
};

/**
 * 设置块是否折叠
 * @param {boolean} collapsed 如果折叠，则为 true
 */
Blockly.Block.prototype.setCollapsed = function(collapsed) {
  if (this.collapsed_ != collapsed) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this, 'collapsed', null, this.collapsed_, collapsed));
    this.collapsed_ = collapsed;
  }
};

/**
 * 创建此块和任何子块的人类可读文本表示
 * @param {number=} opt_maxLength 将字符串截断到此长度
 * @param {string=} opt_emptyToken 占位符字符串，用于表示空字段。如果未指定 ？使用
 * @return {string} 块的文本
 */
Blockly.Block.prototype.toString = function(opt_maxLength, opt_emptyToken) {
  var text = [];
  var emptyFieldPlaceholder = opt_emptyToken || '?';
  if (this.collapsed_) {
    text.push(this.getInput('_TEMP_COLLAPSED_INPUT').fieldRow[0].text_);
  } else {
    for (var i = 0, input; input = this.inputList[i]; i++) {
      for (var j = 0, field; field = input.fieldRow[j]; j++) {
        if (field instanceof Blockly.FieldDropdown && !field.getValue()) {
          text.push(emptyFieldPlaceholder);
        } else {
          text.push(field.getText());
        }
      }
      if (input.connection) {
        var child = input.connection.targetBlock();
        if (child) {
          text.push(child.toString(undefined, opt_emptyToken));
        } else {
          text.push(emptyFieldPlaceholder);
        }
      }
    }
  }
  text = goog.string.trim(text.join(' ')) || '???';
  if (opt_maxLength) {
    // TODO: Improve truncation so that text from this block is given priority.
    // E.g. "1+2+3+4+5+6+7+8+9=0" should be "...6+7+8+9=0", not "1+2+3+4+5...".
    // E.g. "1+2+3+4+5=6+7+8+9+0" should be "...4+5=6+7...".
    text = goog.string.truncate(text, opt_maxLength);
  }
  return text;
};

/**
 * 添加值输入行的快捷方式
 * @param {string} name 标识符，可用于再次查找此输入。应该对此块唯一
 * @return {!Blockly.Input} 创建的输入对象
 */
Blockly.Block.prototype.appendValueInput = function(name) {
  return this.appendInput_(Blockly.INPUT_VALUE, name);
};

/**
 * 添加语句输入行的快捷方式
 * @param {string} name 标识符，可用于再次查找此输入。应该对此块唯一
 * @return {!Blockly.Input} 创建的输入对象
 */
Blockly.Block.prototype.appendStatementInput = function(name) {
  return this.appendInput_(Blockly.NEXT_STATEMENT, name);
};

/**
 * 添加虚拟输入行的快捷方式
 * @param {string=} opt_name 标识符，可用于再次查找此输入。应该对此块唯一
 * @return {!Blockly.Input} 创建的输入对象
 */
Blockly.Block.prototype.appendDummyInput = function(opt_name) {
  return this.appendInput_(Blockly.DUMMY_INPUT, opt_name || '');
};

/**
 * 使用跨平台、国际化友好的JSON描述初始化此块
 * @param {!Object} json 描述块的结构化数据
 */
Blockly.Block.prototype.jsonInit = function(json) {
  var warningPrefix = json['type'] ? 'Block "' + json['type'] + '": ' : '';

  // Validate inputs.
  goog.asserts.assert(
      json['output'] == undefined || json['previousStatement'] == undefined,
      warningPrefix + 'Must not have both an output and a previousStatement.');

  // Set basic properties of block.
  this.jsonInitColour_(json, warningPrefix);

  // Interpolate the message blocks.
  var i = 0;
  while (json['message' + i] !== undefined) {
    this.interpolate_(json['message' + i], json['args' + i] || [],
        json['lastDummyAlign' + i]);
    i++;
  }

  if (json['inputsInline'] !== undefined) {
    this.setInputsInline(json['inputsInline']);
  }
  // Set output and previous/next connections.
  if (json['output'] !== undefined) {
    this.setOutput(true, json['output']);
  }
  if (json['previousStatement'] !== undefined) {
    this.setPreviousStatement(true, json['previousStatement']);
  }
  if (json['nextStatement'] !== undefined) {
    this.setNextStatement(true, json['nextStatement']);
  }
  if (json['tooltip'] !== undefined) {
    var rawValue = json['tooltip'];
    var localizedText = Blockly.utils.replaceMessageReferences(rawValue);
    this.setTooltip(localizedText);
  }
  if (json['enableContextMenu'] !== undefined) {
    var rawValue = json['enableContextMenu'];
    this.contextMenu = !!rawValue;
  }
  if (json['helpUrl'] !== undefined) {
    var rawValue = json['helpUrl'];
    var localizedValue = Blockly.utils.replaceMessageReferences(rawValue);
    this.setHelpUrl(localizedValue);
  }
  if (goog.isString(json['extensions'])) {
    console.warn(
        warningPrefix + 'JSON attribute \'extensions\' should be an array of' +
        ' strings. Found raw string in JSON for \'' + json['type'] +
        '\' block.');
    json['extensions'] = [json['extensions']];  // Correct and continue.
  }

  // Add the mutator to the block
  if (json['mutator'] !== undefined) {
    Blockly.Extensions.apply(json['mutator'], this, true);
  }

  if (Array.isArray(json['extensions'])) {
    var extensionNames = json['extensions'];
    for (var i = 0; i < extensionNames.length; ++i) {
      var extensionName = extensionNames[i];
      Blockly.Extensions.apply(extensionName, this, false);
    }
  }
};

/**
 * 从JSON描述初始化此块的颜色
 * @param {!Object} json 描述块的结构化数据
 * @param {string} warningPrefix 警告前缀字符串标识块
 * @private
 */
Blockly.Block.prototype.jsonInitColour_ = function(json, warningPrefix) {
  if ('colour' in json) {
    if (json['colour'] === undefined) {
      console.warn(warningPrefix + 'Undefined color value.');
    } else {
      var rawValue = json['colour'];
      try {
        this.setColour(rawValue);
      } catch (colorError) {
        console.warn(warningPrefix + 'Illegal color value: ', rawValue);
      }
    }
  }
};

/**
 * 将 mixinObj 中的键/值添加到此块对象。默认情况下，此方法将检查 mixinObj 中的键不会覆盖块中的现有值，包括原型值。
 * 这为防止与未来块功能的混合/扩展不兼容提供了一些保障。
 * 通过将 true 作为第二个参数传递，可以禁用此检查。
 * @param {!Object} mixinObj The key/values pairs to add to this block object.
 * @param {boolean=} opt_disableCheck Option flag to disable overwrite checks.
 */
Blockly.Block.prototype.mixin = function(mixinObj, opt_disableCheck) {
  if (goog.isDef(opt_disableCheck) && !goog.isBoolean(opt_disableCheck)) {
    throw new Error("opt_disableCheck must be a boolean if provided");
  }
  if (!opt_disableCheck) {
    var overwrites = [];
    for (var key in mixinObj) {
      if (this[key] !== undefined) {
        overwrites.push(key);
      }
    }
    if (overwrites.length) {
      throw new Error('Mixin will overwrite block members: ' +
        JSON.stringify(overwrites));
    }
  }
  goog.mixin(this, mixinObj);
};

/**
 * 将消息描述插入到块中
 * @param {string} message 文本包含内插标记(...)与 args 数组中定义的字段或输入匹配。
 * @param {!Array} args 要插入的参数数组
 * @param {string=} lastDummyAlign 如果在末尾添加虚拟输入，应如何对齐它
 * @private
 */
Blockly.Block.prototype.interpolate_ = function(message, args, lastDummyAlign) {
  var tokens = Blockly.utils.tokenizeInterpolation(message);
  // Interpolate the arguments.  Build a list of elements.
  var indexDup = [];
  var indexCount = 0;
  var elements = [];
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (typeof token == 'number') {
      if (token <= 0 || token > args.length) {
        throw new Error('Block "' + this.type + '": ' +
            'Message index %' + token + ' out of range.');
      }
      if (indexDup[token]) {
        throw new Error('Block "' + this.type + '": ' +
            'Message index %' + token + ' duplicated.');
      }
      indexDup[token] = true;
      indexCount++;
      elements.push(args[token - 1]);
    } else {
      token = token.trim();
      if (token) {
        elements.push(token);
      }
    }
  }
  if (indexCount != args.length) {
    throw new Error('Block "' + this.type + '": ' +
        'Message does not reference all ' + args.length + ' arg(s).');
  }
  // Add last dummy input if needed.
  if (elements.length && (typeof elements[elements.length - 1] == 'string' ||
      goog.string.startsWith(
          elements[elements.length - 1]['type'], 'field_'))) {
    var dummyInput = {type: 'input_dummy'};
    if (lastDummyAlign) {
      dummyInput['align'] = lastDummyAlign;
    }
    elements.push(dummyInput);
  }
  // Lookup of alignment constants.
  var alignmentLookup = {
    'LEFT': Blockly.ALIGN_LEFT,
    'RIGHT': Blockly.ALIGN_RIGHT,
    'CENTRE': Blockly.ALIGN_CENTRE
  };
  // Populate block with inputs and fields.
  var fieldStack = [];
  for (var i = 0; i < elements.length; i++) {
    var element = elements[i];
    if (typeof element == 'string') {
      fieldStack.push([element, undefined]);
    } else {
      var field = null;
      var input = null;
      do {
        var altRepeat = false;
        if (typeof element == 'string') {
          field = new Blockly.FieldLabel(element);
        } else {
          switch (element['type']) {
            case 'input_value':
              input = this.appendValueInput(element['name']);
              break;
            case 'input_statement':
              input = this.appendStatementInput(element['name']);
              break;
            case 'input_dummy':
              input = this.appendDummyInput(element['name']);
              break;

            default:
              field = Blockly.Field.fromJson(element);

              // Unknown field.
              if (!field) {
                if (element['alt']) {
                  element = element['alt'];
                  altRepeat = true;
                } else {
                  console.warn('Blockly could not create a field of type ' +
                      element['type'] +
                      '. You may need to register your custom field.  See ' +
                      'github.com/google/blockly/issues/1584');
                }
              }
          }
        }
      } while (altRepeat);
      if (field) {
        fieldStack.push([field, element['name']]);
      } else if (input) {
        if (element['check']) {
          input.setCheck(element['check']);
        }
        if (element['align']) {
          input.setAlign(alignmentLookup[element['align']]);
        }
        for (var j = 0; j < fieldStack.length; j++) {
          input.appendField(fieldStack[j][0], fieldStack[j][1]);
        }
        fieldStack.length = 0;
      }
    }
  }
};

/**
 * 将值输入、语句输入或局部变量添加到此块
 * @param {number} type Blockly.INPUT_VALUE 或者 Blockly.NEXT_STATEMENT 或者 Blockly.DUMMY_INPUT
 * @param {string} name 标识符，可用于再次查找此输入。应该对此块唯一
 * @return {!Blockly.Input} 创建的输入对象
 * @private
 */
Blockly.Block.prototype.appendInput_ = function(type, name) {
  var connection = null;
  if (type == Blockly.INPUT_VALUE || type == Blockly.NEXT_STATEMENT) {
    connection = this.makeConnection_(type);
  }
  var input = new Blockly.Input(type, name, this, connection);
  // Append input to list.
  this.inputList.push(input);
  return input;
};

/**
 * 将命名输入移动到此块上的其他位置
 * @param {string} name 要移动的输入的名称
 * @param {?string} refName 应在移动输入之后的输入名称，或 null 作为末尾的输入
 */
Blockly.Block.prototype.moveInputBefore = function(name, refName) {
  if (name == refName) {
    return;
  }
  // Find both inputs.
  var inputIndex = -1;
  var refIndex = refName ? -1 : this.inputList.length;
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.name == name) {
      inputIndex = i;
      if (refIndex != -1) {
        break;
      }
    } else if (refName && input.name == refName) {
      refIndex = i;
      if (inputIndex != -1) {
        break;
      }
    }
  }
  goog.asserts.assert(inputIndex != -1, 'Named input "%s" not found.', name);
  goog.asserts.assert(
      refIndex != -1, 'Reference input "%s" not found.', refName);
  this.moveNumberedInputBefore(inputIndex, refIndex);
};

/**
 * 将编号输入移动到此块上的其他位置。
 * @param {number} inputIndex 要移动的输入的索引
 * @param {number} refIndex 应在移动输入之后的输入索引
 */
Blockly.Block.prototype.moveNumberedInputBefore = function(
    inputIndex, refIndex) {
  // Validate arguments.
  goog.asserts.assert(inputIndex != refIndex, 'Can\'t move input to itself.');
  goog.asserts.assert(inputIndex < this.inputList.length,
      'Input index ' + inputIndex + ' out of bounds.');
  goog.asserts.assert(refIndex <= this.inputList.length,
      'Reference input ' + refIndex + ' out of bounds.');
  // Remove input.
  var input = this.inputList[inputIndex];
  this.inputList.splice(inputIndex, 1);
  if (inputIndex < refIndex) {
    refIndex--;
  }
  // Reinsert input.
  this.inputList.splice(refIndex, 0, input);
};

/**
 * 删除此块中的输入
 * @param {string} name 输入的名称
 * @param {boolean=} opt_quiet 如果不存在输入，则为 true 以防止出错
 * @throws {goog.asserts.AssertionError} 如果输入不存在且 opt_quiet 不为真。
 */
Blockly.Block.prototype.removeInput = function(name, opt_quiet) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.name == name) {
      if (input.connection && input.connection.isConnected()) {
        input.connection.setShadowDom(null);
        var block = input.connection.targetBlock();
        if (block.isShadow()) {
          // Destroy any attached shadow block.
          block.dispose();
        } else {
          // Disconnect any attached normal block.
          block.unplug();
        }
      }
      input.dispose();
      this.inputList.splice(i, 1);
      return;
    }
  }
  if (!opt_quiet) {
    goog.asserts.fail('Input "%s" not found.', name);
  }
};

/**
 * 获取命名的输入对象
 * @param {string} name 输入的名称
 * @return {Blockly.Input} 输入对象；如果输入不存在，则为空
 */
Blockly.Block.prototype.getInput = function(name) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.name == name) {
      return input;
    }
  }
  // This input does not exist.
  return null;
};

/**
 * 获取添加到命名输入的块。
 * @param {string} name 输入的名称
 * @return {Blockly.Block} 添加的块，如果输入断开连接或输入不存在，则为 null。
 */
Blockly.Block.prototype.getInputTargetBlock = function(name) {
  var input = this.getInput(name);
  return input && input.connection && input.connection.targetBlock();
};

/**
 * 传回此区块的注解(如果没有，则传回 ''
 * @return {string} 块的注释
 */
Blockly.Block.prototype.getCommentText = function() {
  return this.comment || '';
};

/**
 * 设置此块的注释文本
 * @param {?string} text 要删除的文本或空值
 */
Blockly.Block.prototype.setCommentText = function(text) {
  if (this.comment != text) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this, 'comment', null, this.comment, text || ''));
    this.comment = text;
  }
};

/**
 * 设置此块的警告文本
 * @param {?string} _text 要删除的文本或空值
 * @param {string=} _opt_id 警告文本的可选 ID，以便能够维护多个警告。
 */
Blockly.Block.prototype.setWarningText = function(_text, _opt_id) {
  // NOP.
};

/**
 * 给这个块一个变异器对话框
 * @param {Blockly.Mutator} _mutator 要移除的变异子对话方块执行个体或 null
 */
Blockly.Block.prototype.setMutator = function(_mutator) {
  // NOP.
};

/**
 * 传回此图块左上角相对於图面原点( 0，0 )的座标(以工作区为单位)
 * @return {!goog.math.Coordinate} 一个有 .x 和 .y 属性的对象
 */
Blockly.Block.prototype.getRelativeToSurfaceXY = function() {
  return this.xy_;
};

/**
 * 按相对偏移移动块
 * @param {number} dx 水平偏移，以工作区单位表示
 * @param {number} dy 垂直偏移，以工作区单位表示
 */
Blockly.Block.prototype.moveBy = function(dx, dy) {
  goog.asserts.assert(!this.parentBlock_, 'Block has parent.');
  var event = new Blockly.Events.BlockMove(this);
  this.xy_.translate(dx, dy);
  event.recordNew();
  Blockly.Events.fire(event);
};

/**
 * 创建指定类型的连接
 * @param {number} type 要创建的连接的类型
 * @return {!Blockly.Connection} 指定类型的新连接
 * @private
 */
Blockly.Block.prototype.makeConnection_ = function(type) {
  return new Blockly.Connection(this, type);
};

/**
 * 递归检查所有语句和值输入是否都填充了块。还检查此堆栈中的所有语句块。
 * @param {boolean=} opt_shadowBlocksAreFilled 控制阴影块是否计算为已填充的可选参数。默认值为true。
 * @return {boolean} 如果所有输入都已填充，则为true，否则为false。
 */
Blockly.Block.prototype.allInputsFilled = function(opt_shadowBlocksAreFilled) {
  // Account for the shadow block filledness toggle.
  if (opt_shadowBlocksAreFilled === undefined) {
    opt_shadowBlocksAreFilled = true;
  }
  if (!opt_shadowBlocksAreFilled && this.isShadow()) {
    return false;
  }

  // Recursively check each input block of the current block.
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (!input.connection) {
      continue;
    }
    var target = input.connection.targetBlock();
    if (!target || !target.allInputsFilled(opt_shadowBlocksAreFilled)) {
      return false;
    }
  }

  // Recursively check the next block after the current block.
  var next = this.getNextBlock();
  if (next) {
    return next.allInputsFilled(opt_shadowBlocksAreFilled);
  }

  return true;
};

/**
 * 此方法返回以开发人员术语(类型名称和ID；只有英文)。
 *
 * 打算在控制台日志和错误中使用。
 * 如果需要使用用户本机语言(包括块文本、字段值和子块)的字符串，请使用[toString()]。
 * @return {string} The description.
 */
Blockly.Block.prototype.toDevString = function() {
  var msg = this.type ? '"' + this.type + '" block' : 'Block';
  if (this.id) {
    msg += ' (id="' + this.id + '")';
  }
  return msg;
};

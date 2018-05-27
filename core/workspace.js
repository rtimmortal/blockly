/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2012 Google Inc.
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
 * @fileoverview Object representing a workspace.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.Workspace');

goog.require('Blockly.VariableMap');
goog.require('goog.array');
goog.require('goog.math');


/**
 * 类。这是一个包含块的数据结构
 * 没有 UI，可以在顶部创建
 * @param {!Blockly.Options=} opt_options 选项对象
 * @constructor
 */
Blockly.Workspace = function(opt_options) {
  /**
   * @type {string} 唯一 id
   */
  this.id = Blockly.utils.genUid();
  Blockly.Workspace.WorkspaceDB_[this.id] = this;
  /**
   * 传入的 options 或者为 {}
   * @type {!Blockly.Options}
   */
  this.options = opt_options || {};
  /**
   * Right To Left
   * @type {boolean}
   */
  this.RTL = !!this.options.RTL;
  /**
   * 是否为水平的 flyout
   * @type {boolean}
   */
  this.horizontalLayout = !!this.options.horizontalLayout;
  /** toolbox 所在的位置
   * @type {number}
   */
  this.toolboxPosition = this.options.toolboxPosition;

  /**
   * 由 BlockSvg 组成的数组，包含最顶端的积木
   * @type {!Array.<!Blockly.Block>}
   * @private
   */
  this.topBlocks_ = [];
  /**
   * 用户绑定的方法，工作区改变时候会被调用
   * @type {!Array.<!Function>}
   * @private
   */
  this.listeners_ = [];
  /**
   * 可撤销的堆栈，存储一些事件
   * @type {!Array.<!Blockly.Events.Abstract>}
   * @protected
   */
  this.undoStack_ = [];
  /**
   * 可重做的堆栈，存储一些撤销过得事件
   * @type {!Array.<!Blockly.Events.Abstract>}
   * @protected
   */
  this.redoStack_ = [];
  /**
   * 存储工作区的所有 BlockSvg
   * @type {!Object}
   * @private
   */
  this.blockDB_ = Object.create(null);

  /**
   * 从变量类型到变量名称列表的映射
   * 列表包含工作区中的所有命名变量，包括当前未使用的变量
   * @type {!Blockly.VariableMap}
   * @private
   */
  this.variableMap_ = new Blockly.VariableMap(this);

  /**
   * 图示列中的图块可以参考主工作区中不存在的变数
   * 例如，“获取列表中的项”块引用“项”变量，而不管该变量是否已创建
   * 字段变量必须始终引用块变量模型
   * 我们通过跟踪弹出按钮中的“潜在”变量来协调这些变量
   * 当对这些变量的引用被拖到主工作区中时，这些变量将变为真实的
   * @type {!Blockly.VariableMap}
   * @private
   */
  this.potentialVariableMap_ = null;
};

/**
 * 如果工作区可见，则返回 “true”；如果工作区不可见，则返回 “false”
 * @type {boolean}
 */
Blockly.Workspace.prototype.rendered = false;

/**
 * 堆栈中撤消事件的最大数量。Infinity
 * “0” 关闭撤消，“Infinity” 将其设置为“无限”。
 * @type {number}
 */
Blockly.Workspace.prototype.MAX_UNDO = 1024;

/**
 * 销毁此工作区
 * 取消与所有DOM元素的链接以防止内存泄漏
 */
Blockly.Workspace.prototype.dispose = function() {
  this.listeners_.length = 0;
  this.clear();
  // Remove from workspace database.
  delete Blockly.Workspace.WorkspaceDB_[this.id];
};

/**
 * 与水平方向成角度以扫掠图块
 * 执行顺序通常是从上到下，但小角度会改变扫描，从而产生一点从左到右的偏置(在RTL中反转)。单位以度为单位。
 * See: http://tvtropes.org/pmwiki/pmwiki.php/Main/DiagonalBilling.
 */
Blockly.Workspace.SCAN_ANGLE = 3;

/**
 * 将块添加到顶部块列表中
 * @param {!Blockly.Block} block 要添加的块
 */
Blockly.Workspace.prototype.addTopBlock = function(block) {
  this.topBlocks_.push(block);
};

/**
 * 从顶部块列表中删除块
 * @param {!Blockly.Block} block 要删除的块
 */
Blockly.Workspace.prototype.removeTopBlock = function(block) {
  if (!goog.array.remove(this.topBlocks_, block)) {
    throw 'Block not present in workspace\'s list of top-most blocks.';
  }
};

/**
 * 查找顶级块并返回它们。块可选地按位置排序；从上到下(带有轻微的LTR或RTL偏置)。
 * @param {boolean} ordered 如果为true，对列表进行排序。
 * @return {!Array.<!Blockly.Block>} 顶层块对象组成的数组
 */
Blockly.Workspace.prototype.getTopBlocks = function(ordered) {
  // Copy the topBlocks_ list.
  var blocks = [].concat(this.topBlocks_);
  if (ordered && blocks.length > 1) {
    var offset = Math.sin(goog.math.toRadians(Blockly.Workspace.SCAN_ANGLE));
    if (this.RTL) {
      offset *= -1;
    }
    blocks.sort(function(a, b) {
      var aXY = a.getRelativeToSurfaceXY();
      var bXY = b.getRelativeToSurfaceXY();
      return (aXY.y + offset * aXY.x) - (bXY.y + offset * bXY.x);
    });
  }
  return blocks;
};

/**
 * 查找工作区中的所有块。没有特别的命令
 * @return {!Array.<!Blockly.Block>} 块组成的数组
 */
Blockly.Workspace.prototype.getAllBlocks = function() {
  var blocks = this.getTopBlocks(false);
  for (var i = 0; i < blocks.length; i++) {
    blocks.push.apply(blocks, blocks[i].getChildren());
  }
  return blocks;
};

/**
 * 销毁工作区中的所有块
 */
Blockly.Workspace.prototype.clear = function() {
  var existingGroup = Blockly.Events.getGroup();
  if (!existingGroup) {
    Blockly.Events.setGroup(true);
  }
  while (this.topBlocks_.length) {
    this.topBlocks_[0].dispose();
  }
  if (!existingGroup) {
    Blockly.Events.setGroup(false);
  }
  this.variableMap_.clear();
  if (this.potentialVariableMap_) {
    this.potentialVariableMap_.clear();
  }
};

/**
 * 通过在变量映射中更新变量的名称来重命名变量
 * 标识要使用给定ID重命名的变量
 * @param {string} id 要重命名的变量的ID
 * @param {string} newName 新变量名称
 */
Blockly.Workspace.prototype.renameVariableById = function(id, newName) {
  this.variableMap_.renameVariableById(id, newName);
};

/**
 * 创建具有给定名称、可选类型和可选 ID 的变量
 * @param {!string} name 变量的名称，这在变量和过程中必须是唯一的
 * @param {string=} opt_type 变量的类型，如 “int” 或 “string”，
 * 不需要是唯一的。field _ variable 可以根据变量的类型筛选变量。这将默认为“”这是特定类型。
 * @param {string=} opt_id 变量的唯一 ID。这将默认为 UUID
 * @return {?Blockly.VariableModel} 新创建的变量
 */
Blockly.Workspace.prototype.createVariable = function(name, opt_type, opt_id) {
  return this.variableMap_.createVariable(name, opt_type, opt_id);
};

/**
 * 查找由 ID 标识的给定变量的所有用途
 * @param {string} id 要查找的变量的 ID
 * @return {!Array.<!Blockly.Block>} 使用变量的块组成的数组
 */
Blockly.Workspace.prototype.getVariableUsesById = function(id) {
  return this.variableMap_.getVariableUsesById(id);
};

/**
 * 通过传入的 ID 及其所有用途删除此工作区中的变量
 * 可以提示用户确认
 * @param {string} id 要删除的变量的 ID
 */
Blockly.Workspace.prototype.deleteVariableById = function(id) {
  this.variableMap_.deleteVariableById(id);
};

/**
 * 从这个工作区删除变数及其所有用途，而不要求使用者确认
 * @param {!Blockly.VariableModel} variable 要删除的变量
 * @param {!Array.<!Blockly.Block>} uses 变量的使用组成的数组
 * @private
 */
Blockly.Workspace.prototype.deleteVariableInternal_ = function(variable, uses) {
  this.variableMap_.deleteVariableInternal_(variable, uses);
};

/**
 * 检查是否存在具有给定名称的变量。检查不区分大小写
 * @param {string} _name 要检查的名称
 * @return {number} 变量列表中名称的索引，如果不存在，则为 -1
 * @deprecated April 2017 已经被废弃
 */

Blockly.Workspace.prototype.variableIndexOf = function(_name) {
  console.warn(
      'Deprecated call to Blockly.Workspace.prototype.variableIndexOf');
  return -1;
};

/**
 * 按给定名称查找变量并返回它。如果找不到，则返回 null
 * @param {!string} name 要检查的名称
 * @param {string=} opt_type 变量的类型。如果未提供，则默认为空字符串(特定类型)
 * @return {?Blockly.VariableModel} 具有给定名称的变量
 */
// TODO (#1199): Possibly delete this function.
Blockly.Workspace.prototype.getVariable = function(name, opt_type) {
  return this.variableMap_.getVariable(name, opt_type);
};

/**
 * 根据给定 ID 查找变量并返回。如果找不到，则返回 null
 * @param {!string} id The ID to check for.
 * @return {?Blockly.VariableModel} The variable with the given ID.
 */
Blockly.Workspace.prototype.getVariableById = function(id) {
  return this.variableMap_.getVariableById(id);
};

/**
 * 查找具有指定类型的变量。如果类型为 null，则返回字符串类型为空的变量列表
 * @param {?string} type 要查找的变量的类型
 * @return {Array.<Blockly.VariableModel>} 在型别中传递的搜寻变数。如果找不到则为空数组
 */
Blockly.Workspace.prototype.getVariablesOfType = function(type) {
  return this.variableMap_.getVariablesOfType(type);
};

/**
 * 返回所有变量类型
 * @return {!Array.<string>} 变量类型列表
 * @package
 */
Blockly.Workspace.prototype.getVariableTypes = function() {
  return this.variableMap_.getVariableTypes();
};

/**
 * 返回所有类型的所有变量
 * @return {!Array.<Blockly.VariableModel>} 变量模型列表
 */
Blockly.Workspace.prototype.getAllVariables = function() {
  return this.variableMap_.getAllVariables();
};

/**
 * 返回工作区的水平偏移
 * 旨在实现XML中的长期协议/实时协议兼容性
 * 与无头工作区无关
 * @return {number} Width.
 */
Blockly.Workspace.prototype.getWidth = function() {
  return 0;
};

/**
 * 获取新创建的块
 * @param {?string} prototypeName 包含此块的特定类型函数的语言对象的名称
 * @param {string=} opt_id 可选标识。如果提供了此ID，请使用此ID，否则请创建新ID
 * @return {!Blockly.Block} 创建的块
 */
Blockly.Workspace.prototype.newBlock = function(prototypeName, opt_id) {
  return new Blockly.Block(this, prototypeName, opt_id);
};

/**
 * 在达到 maxBlocks 之前可以添加到工作区的块数。
 * @return {number} 剩余块数
 */
Blockly.Workspace.prototype.remainingCapacity = function() {
  if (isNaN(this.options.maxBlocks)) {
    return Infinity;
  }
  return this.options.maxBlocks - this.getAllBlocks().length;
};

/**
 * 撤消或重做上一个操作
 * @param {boolean} redo 撤消时为 false，重做时为 true
 */
Blockly.Workspace.prototype.undo = function(redo) {
  var inputStack = redo ? this.redoStack_ : this.undoStack_;
  var outputStack = redo ? this.undoStack_ : this.redoStack_;
  var inputEvent = inputStack.pop();
  if (!inputEvent) {
    return;
  }
  var events = [inputEvent];
  // Do another undo/redo if the next one is of the same group.
  while (inputStack.length && inputEvent.group &&
      inputEvent.group == inputStack[inputStack.length - 1].group) {
    events.push(inputStack.pop());
  }
  // Push these popped events on the opposite stack.
  for (var i = 0, event; event = events[i]; i++) {
    outputStack.push(event);
  }
  events = Blockly.Events.filter(events, redo);
  Blockly.Events.recordUndo = false;
  try {
    for (var i = 0, event; event = events[i]; i++) {
      event.run(redo);
    }
  } finally {
    Blockly.Events.recordUndo = true;
  }
};

/**
 * 清除撤消/重做堆栈
 */
Blockly.Workspace.prototype.clearUndo = function() {
  this.undoStack_.length = 0;
  this.redoStack_.length = 0;
  // Stop any events already in the firing queue from being undoable.
  Blockly.Events.clearPendingUndo();
};

/**
 * 当此工作区中的某些内容发生更改时，调用绑定的函数函数。
 * @param {!Function} func 要绑定的函数
 * @return {!Function} 可以传递给 removeChangeListener 函数
 */
Blockly.Workspace.prototype.addChangeListener = function(func) {
  this.listeners_.push(func);
  return func;
};

/**
 * 停止侦听此工作区的更改
 * @param {Function} func 函数停止调用
 */
Blockly.Workspace.prototype.removeChangeListener = function(func) {
  goog.array.remove(this.listeners_, func);
};

/**
 * 触发变更事件
 * @param {!Blockly.Events.Abstract} event 开火触发
 */
Blockly.Workspace.prototype.fireChangeListener = function(event) {
  if (event.recordUndo) {
    this.undoStack_.push(event);
    this.redoStack_.length = 0;
    if (this.undoStack_.length > this.MAX_UNDO) {
      this.undoStack_.unshift();
    }
  }
  for (var i = 0, func; func = this.listeners_[i]; i++) {
    func(event);
  }
};

/**
 * 查找此工作区上具有指定 ID 的块
 * @param {string} id 要查找的块的 ID
 * @return {Blockly.Block} 寻找的区块，如果找不到，则为 null
 */
Blockly.Workspace.prototype.getBlockById = function(id) {
  return this.blockDB_[id] || null;
};

/**
 * 检查工作区中的所有值和语句输入是否都用块填充
 * @param {boolean=} opt_shadowBlocksAreFilled 控制阴影块是否计算为已填充的可选参数。默认值为t rue。
 * @return {boolean} 如果所有输入都已填充，则为 true，否则为 false。
 */
Blockly.Workspace.prototype.allInputsFilled = function(opt_shadowBlocksAreFilled) {
  var blocks = this.getTopBlocks(false);
  for (var i = 0, block; block = blocks[i]; i++) {
    if (!block.allInputsFilled(opt_shadowBlocksAreFilled)) {
      return false;
    }
  }
  return true;
};

/**
 * 返回包含“潜在”变量的变量映射。它们存在于弹出按钮中，但不存在于工作区中。
 * @return {?Blockly.VariableMap} The potential variable map.
 * @package
 */
Blockly.Workspace.prototype.getPotentialVariableMap = function() {
  return this.potentialVariableMap_;
};

/**
 * Create and store the potential variable map for this workspace.
 * @package
 */
Blockly.Workspace.prototype.createPotentialVariableMap = function() {
  this.potentialVariableMap_ = new Blockly.VariableMap(this);
};

/**
 * Return the map of all variables on the workspace.
 * @return {?Blockly.VariableMap} The  variable map.
 */
Blockly.Workspace.prototype.getVariableMap = function() {
  return this.variableMap_;
};

/**
 * Database of all workspaces.
 * @private
 */
Blockly.Workspace.WorkspaceDB_ = Object.create(null);

/**
 * Find the workspace with the specified ID.
 * @param {string} id ID of workspace to find.
 * @return {Blockly.Workspace} The sought after workspace or null if not found.
 */
Blockly.Workspace.getById = function(id) {
  return Blockly.Workspace.WorkspaceDB_[id] || null;
};

// Export symbols that would otherwise be renamed by Closure compiler.
Blockly.Workspace.prototype['clear'] = Blockly.Workspace.prototype.clear;
Blockly.Workspace.prototype['clearUndo'] =
    Blockly.Workspace.prototype.clearUndo;
Blockly.Workspace.prototype['addChangeListener'] =
    Blockly.Workspace.prototype.addChangeListener;
Blockly.Workspace.prototype['removeChangeListener'] =
    Blockly.Workspace.prototype.removeChangeListener;

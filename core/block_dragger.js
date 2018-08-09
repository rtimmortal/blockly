/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2017 Google Inc.
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
 * @fileoverview Methods for dragging a block visually.
 * @author fenichel@google.com (Rachel Fenichel)
 */
'use strict';

goog.provide('Blockly.BlockDragger');

goog.require('Blockly.DraggedConnectionManager');
goog.require('Blockly.Events.BlockMove');

goog.require('goog.math.Coordinate');
goog.require('goog.asserts');


/**
 * 关于积木拖动的类. 当积木被鼠标或者触控拖动时，积木会在工作空间上移动
 * 
 * @param {!Blockly.BlockSvg} block 被拖动的积木
 * @param {!Blockly.WorkspaceSvg} workspace 积木被拖动的工作空间
 * @constructor
 */
Blockly.BlockDragger = function(block, workspace) {
  /**
   * 被拖动的积木栈的最顶层的积木
   * @type {!Blockly.BlockSvg}
   * @private
   */
  this.draggingBlock_ = block;

  /**
   * 积木被拖动的工作空间
   * @type {!Blockly.WorkspaceSvg}
   * @private
   */
  this.workspace_ = workspace;

  /**
   * 一个保持对被拖动的积木组合之间的连接的追踪的对象
   * @type {!Blockly.DraggedConnectionManager}
   * @private
   */
  this.draggedConnectionManager_ = new Blockly.DraggedConnectionManager(
      this.draggingBlock_);

  /**
   * 鼠标指针所在的删除区域（如果有）
   * One of {@link Blockly.DELETE_AREA_TRASH},
   * {@link Blockly.DELETE_AREA_TOOLBOX}, or {@link Blockly.DELETE_AREA_NONE}.
   * @type {?number}
   * @private
   */
  this.deleteArea_ = null;

  /**
   * 积木如果被立刻拖动是否会被删除
   * @type {boolean}
   * @private
   */
  this.wouldDeleteBlock_ = false;

  /**
   *被拖动积木在被开始拖动时，积木左上角在工作空间上的坐标定位
   *
   * @type {!goog.math.Coordinate}
   * @private
   */
  this.startXY_ = this.draggingBlock_.getRelativeToSurfaceXY();

  /**
   * 这个积木以及其衍生出的积木上的所有图标(comment, warning, and mutator)的列表
   * 如果bubble是打开的，移动一个图标时就会移动这个图标衍生出来的bubble
   * 
   * @type {Array.<!Object>}
   * @private
   */
  this.dragIconData_ = Blockly.BlockDragger.initIconData_(block);
};

/**
 * 切断这个对象的所有连接
 * @package
 */
Blockly.BlockDragger.prototype.dispose = function() {
  this.draggingBlock_ = null;
  this.workspace_ = null;
  this.startWorkspace_ = null;
  this.dragIconData_.length = 0;

  if (this.draggedConnectionManager_) {
    this.draggedConnectionManager_.dispose();
    this.draggedConnectionManager_ = null;
  }
};

/**
   * 这个积木以及其衍生出的积木上的所有图标(comment, warning, and mutator)的列表
   * 如果bubble是打开的，移动一个图标时就会移动这个图标衍生出来的bubble
 * 
 * @param {!Blockly.BlockSvg} block 被拖动的根积木
 * @return {!Array.<!Object>} 包含所有图标及其定位的列表
 * @private
 */
Blockly.BlockDragger.initIconData_ = function(block) {
  // 建立一个需要被移动的图标和其开始位置的列表
  var dragIconData = [];
  var descendants = block.getDescendants();
  for (var i = 0, descendant; descendant = descendants[i]; i++) {
    var icons = descendant.getIcons();
    for (var j = 0; j < icons.length; j++) {
      var data = {
        // goog.math.Coordinate with x and y properties (workspace coordinates).
        location: icons[j].getIconLocation(),
        // Blockly.Icon
        icon: icons[j]
      };
      dragIconData.push(data);
    }
  }
  return dragIconData;
};

/**
 * 开始拖动一个积木。  这包括将其移动到拖动层
 * @param {!goog.math.Coordinate} currentDragDeltaXY 指针从开始到停止的移动距离(像素单位)
 * @param {boolean} healStack 断开连接后是否要恢复堆栈
 * @package
 */
Blockly.BlockDragger.prototype.startBlockDrag = function(currentDragDeltaXY, healStack) {
  if (!Blockly.Events.getGroup()) {
    Blockly.Events.setGroup(true);
  }

  this.workspace_.setResizesEnabled(false);
  Blockly.BlockSvg.disconnectUiStop_();

  if (this.draggingBlock_.getParent() ||
      (healStack && this.draggingBlock_.nextConnection &&
      this.draggingBlock_.nextConnection.targetBlock())) {
    this.draggingBlock_.unplug(healStack);
    var delta = this.pixelsToWorkspaceUnits_(currentDragDeltaXY);
    var newLoc = goog.math.Coordinate.sum(this.startXY_, delta);

    this.draggingBlock_.translate(newLoc.x, newLoc.y);
    this.draggingBlock_.disconnectUiEffect();
  }
  this.draggingBlock_.setDragging(true);
  // For future consideration: we may be able to put moveToDragSurface inside
  // the block dragger, which would also let the block not track the block drag
  // surface.
  this.draggingBlock_.moveToDragSurface_();

  var toolbox = this.workspace_.getToolbox();
  if (toolbox) {
    var style = this.draggingBlock_.isDeletable() ? 'blocklyToolboxDelete' :
        'blocklyToolboxGrab';
    toolbox.addStyle(style);
  }
};

/**
 * 基于给出的事件执行积木拖动.相应地更新显示
 * 
 * @param {!Event} e 最近的拖动事件
 * @param {!goog.math.Coordinate} currentDragDeltaXY 指针从开始到停止的移动距离(像素单位)
 * @package
 */
Blockly.BlockDragger.prototype.dragBlock = function(e, currentDragDeltaXY) {
  var delta = this.pixelsToWorkspaceUnits_(currentDragDeltaXY);
  var newLoc = goog.math.Coordinate.sum(this.startXY_, delta);

  this.draggingBlock_.moveDuringDrag(newLoc);
  this.dragIcons_(delta);

  this.deleteArea_ = this.workspace_.isDeleteArea(e);
  this.draggedConnectionManager_.update(delta, this.deleteArea_);

  this.updateCursorDuringBlockDrag_();
};

/**
 * 结束积木的拖动并且把积木放回工作空间
 * @param {!Event} e 鼠标松开/触摸停止事件
 * @param {!goog.math.Coordinate} currentDragDeltaXY 指针从开始到停止的移动距离(像素单位)
 * @package
 */
Blockly.BlockDragger.prototype.endBlockDrag = function(e, currentDragDeltaXY) {
  // Make sure internal state is fresh.
  this.dragBlock(e, currentDragDeltaXY);
  this.dragIconData_ = [];

  Blockly.BlockSvg.disconnectUiStop_();

  var delta = this.pixelsToWorkspaceUnits_(currentDragDeltaXY);
  var newLoc = goog.math.Coordinate.sum(this.startXY_, delta);
  this.draggingBlock_.moveOffDragSurface_(newLoc);

  var deleted = this.maybeDeleteBlock_();
  if (!deleted) {
    // These are expensive and don't need to be done if we're deleting.
    this.draggingBlock_.moveConnections_(delta.x, delta.y);
    this.draggingBlock_.setDragging(false);
    this.draggedConnectionManager_.applyConnections();
    this.draggingBlock_.render();
    this.fireMoveEvent_();
    this.draggingBlock_.scheduleSnapAndBump();
  }
  this.workspace_.setResizesEnabled(true);

  var toolbox = this.workspace_.getToolbox();
  if (toolbox) {
    var style = this.draggingBlock_.isDeletable() ? 'blocklyToolboxDelete' :
        'blocklyToolboxGrab';
    toolbox.removeStyle(style);
  }
  Blockly.Events.setGroup(false);
};

/**
 * 在积木拖动结束时触发移动事件。
 * @private
 */
Blockly.BlockDragger.prototype.fireMoveEvent_ = function() {
  var event = new Blockly.Events.BlockMove(this.draggingBlock_);
  event.oldCoordinate = this.startXY_;
  event.recordNew();
  Blockly.Events.fire(event);
};

/**
 * 关闭垃圾桶并且在需要的时候删除正在拖动的积木
 * 应该在积木拖动结束时调用
 * @return {boolean} 积木是否被删除
 * @private
 */
Blockly.BlockDragger.prototype.maybeDeleteBlock_ = function() {
  var trashcan = this.workspace_.trashcan;

  if (this.wouldDeleteBlock_) {
    if (trashcan) {
      goog.Timer.callOnce(trashcan.close, 100, trashcan);
    }
    // 触发一个移动事件, 所以我们知道应该撤回到哪里.
    this.fireMoveEvent_();
    this.draggingBlock_.dispose(false, true);
  } else if (trashcan) {
    // 确保垃圾桶被关闭
    trashcan.close();
  }
  return this.wouldDeleteBlock_;
};

/**
 * 更新光标(可能是垃圾桶的盖子)来反映正在被拖动的积木如果被立刻松开是否会被删除
 * @private
 */
Blockly.BlockDragger.prototype.updateCursorDuringBlockDrag_ = function() {
  this.wouldDeleteBlock_ = this.draggedConnectionManager_.wouldDeleteBlock();
  var trashcan = this.workspace_.trashcan;
  if (this.wouldDeleteBlock_) {
    this.draggingBlock_.setDeleteStyle(true);
    if (this.deleteArea_ == Blockly.DELETE_AREA_TRASH && trashcan) {
      trashcan.setOpen_(true);
    }
  } else {
    this.draggingBlock_.setDeleteStyle(false);
    if (trashcan) {
      trashcan.setOpen_(false);
    }
  }
};

/**
 * 把一个坐标从像素单位转换成工作空间中的单位, 包括对于mutator workspaces的修正
 * 这个函数不考虑differing origins.它只是简单的缩放x与y值
 * @param {!goog.math.Coordinate} pixelCoord A coordinate with x and y values
 *     in css pixel units.
 * @return {!goog.math.Coordinate} The input coordinate divided by the workspace
 *     scale.
 * @private
 */
Blockly.BlockDragger.prototype.pixelsToWorkspaceUnits_ = function(pixelCoord) {
  var result = new goog.math.Coordinate(pixelCoord.x / this.workspace_.scale,
      pixelCoord.y / this.workspace_.scale);
  if (this.workspace_.isMutator) {
    // If we're in a mutator, its scale is always 1, purely because of some
    // oddities in our rendering optimizations.  The actual scale is the same as
    // the scale on the parent workspace.
    // Fix that for dragging.
    var mainScale = this.workspace_.options.parentWorkspace.scale;
    result = result.scale(1 / mainScale);
  }
  return result;
};

/**
 * 将所有图标都连接到拖动上
 * @param {!goog.math.Coordinate} dxy 图标移动的距离(工作空间单位)
 * @private
 */
Blockly.BlockDragger.prototype.dragIcons_ = function(dxy) {
  // Moving icons moves their associated bubbles.
  for (var i = 0; i < this.dragIconData_.length; i++) {
    var data = this.dragIconData_[i];
    data.icon.setIconLocation(goog.math.Coordinate.sum(data.location, dxy));
  }
};

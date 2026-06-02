const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['file', 'folder'],
    required: true,
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    default: null,
  },
  order: {
    type: Number,
    default: 0,
  },
  content: {
    type: String,
  },
  cloudinaryId: {
    type: String,
    default: null,
  },
  cloudinaryUrl: {
    type: String,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);

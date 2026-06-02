const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const Chat = require('../models/Chat');
const auth = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper to upload text content to cloudinary as a raw file
const uploadToCloudinary = async (filename, content) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn("Cloudinary not configured. Mocking upload.");
    return {
      public_id: `mock_${Date.now()}`,
      secure_url: `https://mock.url/${filename}`
    };
  }
  const base64Content = Buffer.from(content).toString('base64');
  const dataUri = `data:text/plain;base64,${base64Content}`;
  
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(dataUri, {
      resource_type: 'raw',
      folder: 'markdown',
      public_id: `${filename}_${Date.now()}`
    }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

const deleteFromCloudinary = async (public_id) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || public_id.startsWith('mock_')) return;
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(public_id, { resource_type: 'raw' }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

// @route   GET api/items
// @desc    Get all items (public)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const items = await Item.find().sort({ order: 1 });
    res.json(items);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/items
// @desc    Create an item (folder or file)
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { name, type, parentId, content } = req.body;
    
    // Check for duplicate name under the same parent directory (case-insensitive)
    const existingItem = await Item.findOne({
      parentId: parentId || null,
      name: { $regex: new RegExp(`^${name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
    });
    if (existingItem) {
      return res.status(400).json({ msg: `An item named "${name}" already exists in this folder` });
    }
    
    // Get max order in parent
    const maxOrderObj = await Item.findOne({ parentId: parentId || null }).sort({ order: -1 });
    const order = maxOrderObj ? maxOrderObj.order + 1 : 0;

    const newItem = new Item({
      name,
      type,
      parentId: parentId || null,
      order
    });

    if (type === 'file') {
      const fileContent = content || '# New File';
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        const result = await uploadToCloudinary(name, fileContent);
        newItem.cloudinaryId = result.public_id;
        newItem.cloudinaryUrl = result.secure_url;
      } else {
        newItem.content = fileContent;
      }
    }

    const item = await newItem.save();
    res.json(item);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/items/:id
// @desc    Update an item (rename folder, or update file content)
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, content } = req.body;
    let item = await Item.findById(req.params.id);

    if (!item) return res.status(404).json({ msg: 'Item not found' });

    if (name && name !== item.name) {
      let finalName = name.trim();
      if (item.type === 'file' && !finalName.toLowerCase().endsWith('.md')) {
        finalName += '.md';
      }
      if (finalName !== item.name) {
        // Check for duplicate name under the same parent directory (case-insensitive), excluding this item itself
        const existingItem = await Item.findOne({
          parentId: item.parentId,
          name: { $regex: new RegExp(`^${finalName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
          _id: { $ne: item._id }
        });
        if (existingItem) {
          return res.status(400).json({ msg: `An item named "${finalName.replace(/\.md$/i, '')}" already exists in this folder` });
        }
        item.name = finalName;
      }
    }

    if (item.type === 'file' && content !== undefined) {
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        // Re-upload to cloudinary
        if (item.cloudinaryId) {
          await deleteFromCloudinary(item.cloudinaryId);
        }
        const result = await uploadToCloudinary(item.name, content);
        item.cloudinaryId = result.public_id;
        item.cloudinaryUrl = result.secure_url;
        item.content = undefined; // Remove content from MongoDB
      } else {
        item.content = content;
      }
    }

    item = await item.save();
    res.json(item);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/items/:id
// @desc    Delete an item
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) return res.status(404).json({ msg: 'Item not found' });

    // Function to recursively delete children
    const deleteRecursively = async (parentId) => {
      const children = await Item.find({ parentId });
      for (let child of children) {
        if (child.type === 'file' && child.cloudinaryId) {
          await deleteFromCloudinary(child.cloudinaryId);
        }
        await Chat.deleteMany({ itemId: child._id });
        await deleteRecursively(child._id);
        await Item.findByIdAndDelete(child._id);
      }
    };

    await deleteRecursively(item._id);

    if (item.type === 'file' && item.cloudinaryId) {
      await deleteFromCloudinary(item.cloudinaryId);
    }
    await Chat.deleteMany({ itemId: item._id });
    
    await Item.findByIdAndDelete(req.params.id);
    
    res.json({ msg: 'Item removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/items/action/batch-delete
// @desc    Delete multiple items
// @access  Private
router.post('/action/batch-delete', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ msg: 'Please provide an array of item IDs' });
    }

    const deleteRecursively = async (parentId) => {
      const children = await Item.find({ parentId });
      for (let child of children) {
        if (child.type === 'file' && child.cloudinaryId) {
          await deleteFromCloudinary(child.cloudinaryId);
        }
        await Chat.deleteMany({ itemId: child._id });
        await deleteRecursively(child._id);
        await Item.findByIdAndDelete(child._id);
      }
    };

    for (let id of ids) {
      const item = await Item.findById(id);
      if (item) {
        await deleteRecursively(item._id);
        if (item.type === 'file' && item.cloudinaryId) {
          await deleteFromCloudinary(item.cloudinaryId);
        }
        await Chat.deleteMany({ itemId: id });
        await Item.findByIdAndDelete(id);
      }
    }

    res.json({ msg: 'Items and their contents deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/items/reorder
// @desc    Reorder items
// @access  Private
router.put('/action/reorder', auth, async (req, res) => {
  try {
    // Expects array of { id, order, parentId }
    const { updates } = req.body;
    
    for (let update of updates) {
      await Item.findByIdAndUpdate(update.id, { 
        order: update.order, 
        parentId: update.parentId || null 
      });
    }

    res.json({ msg: 'Reordered successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

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

const uploadToCloudinary = async (filename, content) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn("Cloudinary not configured. Mocking upload.");
    return {
      public_id: `mock_${Date.now()}`,
      secure_url: `https://mock.url/${filename}`
    };
  }
  
  let dataUri;
  let resourceType = 'raw';
  
  if (typeof content === 'string' && content.startsWith('data:')) {
    dataUri = content;
    resourceType = 'auto';
  } else {
    const base64Content = Buffer.from(content).toString('base64');
    dataUri = `data:text/plain;base64,${base64Content}`;
  }
  
  // Extract extension and sanitize the base name
  const lastDot = filename.lastIndexOf('.');
  let nameWithoutExt = filename;
  let ext = '';
  if (lastDot !== -1) {
    nameWithoutExt = filename.substring(0, lastDot);
    ext = filename.substring(lastDot);
  }
  const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const publicId = `${sanitizedName}_${Date.now()}${ext}`;
  
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(dataUri, {
      resource_type: resourceType,
      folder: 'markdown',
      public_id: publicId
    }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

const deleteFromCloudinary = async (public_id) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || public_id.startsWith('mock_')) return;
  return new Promise((resolve) => {
    cloudinary.uploader.destroy(public_id, { resource_type: 'image' }, (err1, res1) => {
      cloudinary.uploader.destroy(public_id, { resource_type: 'raw' }, (err2, res2) => {
        resolve(res2 || res1);
      });
    });
  });
};

// @route   GET api/items
// @desc    Get all items (authenticated)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Check if user has an Archive folder; if not, create one
    let archiveFolder = await Item.findOne({ userId: req.user.id, isArchive: true });
    if (!archiveFolder) {
      archiveFolder = new Item({
        userId: req.user.id,
        name: 'Archive',
        type: 'folder',
        parentId: null,
        order: 1000000, // Bottom of root
        isArchive: true,
        isPinned: false
      });
      await archiveFolder.save();
    }

    const items = await Item.find({ userId: req.user.id }).sort({ order: 1 });
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
    
    let finalName = name.trim();
    let finalExtension = null;

    if (type === 'file') {
      const lastDot = finalName.lastIndexOf('.');
      if (lastDot !== -1) {
        finalExtension = finalName.substring(lastDot + 1).toLowerCase();
        finalName = finalName.substring(0, lastDot);
      }
    }
    
    // Check for duplicate name under the same parent directory for this user (case-insensitive)
    const existingItem = await Item.findOne({
      userId: req.user.id,
      parentId: parentId || null,
      name: { $regex: new RegExp(`^${finalName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
      extension: finalExtension
    });
    if (existingItem) {
      return res.status(400).json({ msg: `An item named "${finalName}" already exists in this folder` });
    }
    
    // Get default order based on root vs subfolder
    let order = 0;
    if (parentId) {
      // Subfolder: new items go to the bottom (max order + 1)
      const maxOrderObj = await Item.findOne({ userId: req.user.id, parentId }).sort({ order: -1 });
      order = maxOrderObj ? maxOrderObj.order + 1 : 0;
    } else {
      // Root: new items go to the top (min order - 1)
      const minOrderObj = await Item.findOne({ userId: req.user.id, parentId: null }).sort({ order: 1 });
      order = minOrderObj ? minOrderObj.order - 1 : 0;
    }

    const newItem = new Item({
      userId: req.user.id,
      name: finalName,
      type,
      parentId: parentId || null,
      order,
      isArchive: false,
      isPinned: false,
      extension: finalExtension
    });

    if (type === 'file') {
      const fileContent = content || '# New File';
      const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg', 'mov', 'mp3', 'wav', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(finalExtension);
      
      if (process.env.CLOUDINARY_CLOUD_NAME && isMedia) {
        const originalFilename = finalExtension ? `${finalName}.${finalExtension}` : finalName;
        const result = await uploadToCloudinary(originalFilename, fileContent);
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
    const { name, content, isPinned, pinOrder } = req.body;
    let item = await Item.findOne({ _id: req.params.id, userId: req.user.id });

    if (!item) return res.status(404).json({ msg: 'Item not found' });

    if (item.isArchive && name && name !== item.name) {
      return res.status(400).json({ msg: 'The Archive folder cannot be renamed' });
    }

    if (name && name !== item.name) {
      let inputName = name.trim();
      let finalName = inputName;
      let finalExtension = item.extension;

      if (item.type === 'file') {
        const lastDot = inputName.lastIndexOf('.');
        if (lastDot !== -1) {
          finalName = inputName.substring(0, lastDot);
          finalExtension = inputName.substring(lastDot + 1).toLowerCase();
        } else {
          finalName = inputName;
        }
      }

      if (finalName !== item.name || finalExtension !== item.extension) {
        // Check for duplicate name under the same parent directory (case-insensitive), excluding this item itself
        const existingItem = await Item.findOne({
          userId: req.user.id,
          parentId: item.parentId,
          name: { $regex: new RegExp(`^${finalName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
          extension: finalExtension,
          _id: { $ne: item._id }
        });
        if (existingItem) {
          return res.status(400).json({ msg: `An item named "${finalName}" already exists in this folder` });
        }
        item.name = finalName;
        item.extension = finalExtension;
      }
    }

    if (isPinned !== undefined) {
      item.isPinned = isPinned;
    }

    if (pinOrder !== undefined) {
      item.pinOrder = pinOrder;
    }

    if (item.type === 'file' && content !== undefined) {
      const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg', 'mov', 'mp3', 'wav', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(item.extension);
      
      if (process.env.CLOUDINARY_CLOUD_NAME && isMedia) {
        // Re-upload to cloudinary
        if (item.cloudinaryId) {
          await deleteFromCloudinary(item.cloudinaryId);
        }
        const originalFilename = item.extension ? `${item.name}.${item.extension}` : item.name;
        const result = await uploadToCloudinary(originalFilename, content);
        item.cloudinaryId = result.public_id;
        item.cloudinaryUrl = result.secure_url;
        item.content = undefined; // Remove content from MongoDB
      } else {
        item.content = content;
        item.cloudinaryId = null;
        item.cloudinaryUrl = null;
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
    const item = await Item.findOne({ _id: req.params.id, userId: req.user.id });

    if (!item) return res.status(404).json({ msg: 'Item not found' });

    if (item.isArchive) {
      return res.status(400).json({ msg: 'The Archive folder cannot be deleted' });
    }

    // Function to recursively delete children
    const deleteRecursively = async (parentId) => {
      const children = await Item.find({ userId: req.user.id, parentId });
      for (let child of children) {
        if (child.type === 'file' && child.cloudinaryId) {
          await deleteFromCloudinary(child.cloudinaryId);
        }
        await Chat.deleteMany({ itemId: child._id });
        await deleteRecursively(child._id);
        await Item.findOneAndDelete({ _id: child._id, userId: req.user.id });
      }
    };

    await deleteRecursively(item._id);

    if (item.type === 'file' && item.cloudinaryId) {
      await deleteFromCloudinary(item.cloudinaryId);
    }
    await Chat.deleteMany({ itemId: item._id });
    
    await Item.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    
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
      const children = await Item.find({ userId: req.user.id, parentId });
      for (let child of children) {
        if (child.type === 'file' && child.cloudinaryId) {
          await deleteFromCloudinary(child.cloudinaryId);
        }
        await Chat.deleteMany({ itemId: child._id });
        await deleteRecursively(child._id);
        await Item.findOneAndDelete({ _id: child._id, userId: req.user.id });
      }
    };

    for (let id of ids) {
      const item = await Item.findOne({ _id: id, userId: req.user.id });
      if (item && !item.isArchive) {
        await deleteRecursively(item._id);
        if (item.type === 'file' && item.cloudinaryId) {
          await deleteFromCloudinary(item.cloudinaryId);
        }
        await Chat.deleteMany({ itemId: id });
        await Item.findOneAndDelete({ _id: id, userId: req.user.id });
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
    // Expects array of { id, order, parentId, pinOrder }
    const { updates } = req.body;
    
    for (let update of updates) {
      const updateData = {};
      if (update.order !== undefined) {
        updateData.order = update.order;
      }
      if (update.parentId !== undefined) {
        updateData.parentId = update.parentId || null;
      }
      if (update.pinOrder !== undefined) {
        updateData.pinOrder = update.pinOrder;
      }
      
      await Item.findOneAndUpdate(
        { _id: update.id, userId: req.user.id, isArchive: { $ne: true } }, 
        updateData
      );
    }

    res.json({ msg: 'Reordered successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

const jwt = require('jsonwebtoken');

// @route   GET api/items/:id/view
// @desc    Stream/view file content directly (handles CORS and acts as auth proxy)
// @access  Private (auth handled internally via cookies/headers/query)
router.get('/:id/view', async (req, res) => {
  try {
    let token = null;
    if (req.query && req.query.token) {
      token = req.query.token;
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    } else {
      const authHeader = req.header('Authorization');
      if (authHeader) {
        token = authHeader.replace('Bearer ', '');
      }
    }

    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    const userId = decoded.user.id;

    const item = await Item.findOne({ _id: req.params.id, userId });
    if (!item || item.type !== 'file') {
      return res.status(404).json({ msg: 'File not found' });
    }

    const downloadMode = req.query.download === 'true';
    const filenameWithExt = item.extension ? `${item.name}.${item.extension}` : item.name;

    if (item.cloudinaryUrl) {
      const response = await fetch(item.cloudinaryUrl);
      if (!response.ok) {
        return res.status(response.status).send('Failed to fetch from storage');
      }
      
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      res.setHeader('Content-Type', contentType);
      if (downloadMode) {
        res.setHeader('Content-Disposition', `attachment; filename="${filenameWithExt}"`);
      } else {
        res.setHeader('Content-Disposition', 'inline');
      }
      res.send(buffer);
    } else {
      if (item.content && item.content.startsWith('data:')) {
        const matches = item.content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const buffer = Buffer.from(matches[2], 'base64');
          res.setHeader('Content-Type', matches[1]);
          if (downloadMode) {
            res.setHeader('Content-Disposition', `attachment; filename="${filenameWithExt}"`);
          } else {
            res.setHeader('Content-Disposition', 'inline');
          }
          res.send(buffer);
          return;
        }
      }
      
      res.setHeader('Content-Type', 'text/plain');
      if (downloadMode) {
        res.setHeader('Content-Disposition', `attachment; filename="${filenameWithExt}"`);
      } else {
        res.setHeader('Content-Disposition', 'inline');
      }
      res.send(item.content || '');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

import React, { useState, useContext, useMemo, useRef, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FaFolder, FaFolderOpen, FaFileAlt, FaPlus, FaTrash, FaEdit, FaUpload, FaEllipsisV, FaSun, FaMoon, FaDesktop, FaCheckSquare, FaSearch, FaTimes, FaThumbtack, FaSortAmountDown, FaSortAmountUp, FaBars, FaSort, FaBan, FaMinusSquare } from 'react-icons/fa';
import api from '../api';

import { useNavigate } from 'react-router-dom';
import logoImg from '../assets/Logo.png';
import { ThemeContext } from '../context/ThemeContext';

const Sidebar = ({ items, fetchItems, onSelectFile, selectedFileId, isOpen, toggleSidebar }) => {
  const { isAuthenticated, logout } = useContext(AuthContext);
  const { themeMode, setThemeMode } = useContext(ThemeContext);
  const navigate = useNavigate();
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const fileInputRef = useRef(null);
  const [uploadParentId, setUploadParentId] = useState(null);
  const [activeDropdownId, setActiveDropdownId] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragHoveredFolderId, setDragHoveredFolderId] = useState(null);
  const dragCounter = useRef(0);
  const dragExpandTimeoutRef = useRef(null);

  const [sortDirection, setSortDirection] = useState('custom'); // 'custom', 'desc', 'asc'
  const [isReversed, setIsReversed] = useState(false);
  const [isPinnedFolderExpanded, setIsPinnedFolderExpanded] = useState(true);
  const [isPinnedSelectMode, setIsPinnedSelectMode] = useState(false);
  const [selectedPinnedItemIds, setSelectedPinnedItemIds] = useState(new Set());

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const isDesktop = window.innerWidth > 768;
    if (isDesktop) {
      const savedDesktop = localStorage.getItem('sidebarWidthDesktop');
      return savedDesktop ? parseInt(savedDesktop, 10) : 335;
    } else {
      const savedMobile = localStorage.getItem('sidebarWidthMobile');
      return savedMobile ? parseInt(savedMobile, 10) : 300;
    }
  });
  const [isResizing, setIsResizing] = useState(false);

  const initResize = (e) => {
    setIsResizing(true);
  };

  useEffect(() => {
    const handleWindowResize = () => {
      const isDesktop = window.innerWidth > 768;
      if (isDesktop) {
        const savedDesktop = localStorage.getItem('sidebarWidthDesktop');
        setSidebarWidth(savedDesktop ? parseInt(savedDesktop, 10) : 335);
      } else {
        const savedMobile = localStorage.getItem('sidebarWidthMobile');
        setSidebarWidth(savedMobile ? parseInt(savedMobile, 10) : 300);
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const isDesktop = window.innerWidth > 768;
      const minW = isDesktop ? 335 : 300;
      const newWidth = Math.max(minW, Math.min(clientX, window.innerWidth - 50));
      setSidebarWidth(newWidth);
      if (isDesktop) {
        localStorage.setItem('sidebarWidthDesktop', newWidth.toString());
      } else {
        localStorage.setItem('sidebarWidthMobile', newWidth.toString());
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('touchmove', handleMouseMove, { passive: false });
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isResizing]);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [preSearchExpandedFolders, setPreSearchExpandedFolders] = useState(null);
  const lastQueryRef = useRef('');
  const lastItemsRef = useRef(items);

  // Memoized filtered tree data
  const filteredTreeData = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase().trim();

    // Find all items matching the query directly
    const directMatchingIds = new Set();
    items.forEach(item => {
      if (item.name.toLowerCase().includes(query)) {
        directMatchingIds.add(item._id);
      }
    });

    // If a folder matches directly, recursively include all of its sub-items
    const matchingIds = new Set(directMatchingIds);
    const visitedDescendants = new Set();
    const collectAllDescendants = (parentId) => {
      if (visitedDescendants.has(parentId)) return;
      visitedDescendants.add(parentId);
      const children = items.filter(item => item.parentId === parentId);
      children.forEach(child => {
        matchingIds.add(child._id);
        if (child.type === 'folder') {
          collectAllDescendants(child._id);
        }
      });
    };

    directMatchingIds.forEach(id => {
      const item = items.find(i => i._id === id);
      if (item && item.type === 'folder') {
        collectAllDescendants(id);
      }
    });

    // Traverse upwards from each matching item to collect all ancestor folder IDs
    const visibleIds = new Set(matchingIds);
    const parentMap = {};
    items.forEach(item => {
      parentMap[item._id] = item.parentId;
    });

    matchingIds.forEach(id => {
      let currentParent = parentMap[id];
      const visitedParents = new Set();
      while (currentParent && !visitedParents.has(currentParent)) {
        visitedParents.add(currentParent);
        visibleIds.add(currentParent);
        currentParent = parentMap[currentParent];
      }
    });

    return { visibleIds, matchingIds };
  }, [items, searchQuery]);

  // Handle search auto-expansion and pre-search state restoration
  useEffect(() => {
    const currentQuery = searchQuery.trim();
    const prevQuery = lastQueryRef.current.trim();
    const itemsChanged = lastItemsRef.current !== items;

    lastQueryRef.current = searchQuery;
    lastItemsRef.current = items;

    if (!currentQuery) {
      // Search cleared -> restore pre-search state
      if (preSearchExpandedFolders !== null) {
        setExpandedFolders(preSearchExpandedFolders);
        setPreSearchExpandedFolders(null);
      }
      return;
    }

    // Search active -> Capture pre-search state if we haven't already
    if (preSearchExpandedFolders === null) {
      setPreSearchExpandedFolders(new Set(expandedFolders));
    }

    // If query has changed (or items changed), calculate parents of directly matching items to expand
    if (currentQuery !== prevQuery || itemsChanged) {
      const query = currentQuery.toLowerCase();
      
      // Auto-expand pinned folder if a pinned file matches
      const hasPinnedMatch = items.some(item => item.isPinned && item.type === 'file' && item.name.toLowerCase().includes(query));
      if (hasPinnedMatch) {
        setIsPinnedFolderExpanded(true);
      }

      const directMatchingIds = new Set();
      items.forEach(item => {
        if (item.name.toLowerCase().includes(query)) {
          directMatchingIds.add(item._id);
        }
      });

      const parentMap = {};
      items.forEach(item => {
        parentMap[item._id] = item.parentId;
      });

      const ancestorsToExpand = new Set();
      const visitedAncestors = new Set();
      directMatchingIds.forEach(id => {
        let parentId = parentMap[id];
        while (parentId && !visitedAncestors.has(parentId)) {
          visitedAncestors.add(parentId);
          ancestorsToExpand.add(parentId);
          parentId = parentMap[parentId];
        }
      });

      setExpandedFolders(prev => {
        const next = new Set(prev);
        ancestorsToExpand.forEach(id => next.add(id));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, items, preSearchExpandedFolders]);


  // Helper to recursively collect all children IDs of a folder
  const getAllChildIds = (parentId, visited = new Set()) => {
    if (visited.has(parentId)) return [];
    visited.add(parentId);
    const childIds = [];
    const children = items.filter(item => item.parentId === parentId);
    children.forEach(child => {
      childIds.push(child._id);
      if (child.type === 'folder') {
        childIds.push(...getAllChildIds(child._id, visited));
      }
    });
    return childIds;
  };

  const handleToggleSelectItem = (itemId, e) => {
    if (e) e.stopPropagation();
    const newSelected = new Set(selectedItemIds);
    const item = items.find(i => i._id === itemId);

    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
      // If it's a folder, also deselect all its children recursively
      if (item && item.type === 'folder') {
        const childIds = getAllChildIds(itemId);
        childIds.forEach(id => newSelected.delete(id));
      }
    } else {
      newSelected.add(itemId);
      // If it's a folder, also select all its children recursively
      if (item && item.type === 'folder') {
        const childIds = getAllChildIds(itemId);
        childIds.forEach(id => newSelected.add(id));
      }
    }
    setSelectedItemIds(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedItemIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete the ${selectedItemIds.size} selected item(s)?`)) return;

    try {
      await api.post('/items/action/batch-delete', { ids: Array.from(selectedItemIds) });
      const shouldClose = selectedItemIds.has(selectedFileId) ||
        Array.from(selectedItemIds).some(id => activeAncestors.has(id));
      if (shouldClose) {
        onSelectFile(null);
      }
      fetchItems();
      setSelectedItemIds(new Set());
      setIsSelectMode(false);
    } catch (err) {
      console.error(err);
      alert('Failed to delete selected items');
    }
  };

  const handleBatchPin = async () => {
    const selectedFiles = items.filter(item => selectedItemIds.has(item._id) && item.type === 'file' && !item.isPinned);
    if (selectedFiles.length === 0) {
      alert("No unpinned files selected.");
      return;
    }
    try {
      const promises = selectedFiles.map((file, idx) => api.put(`/items/${file._id}`, { 
        isPinned: true,
        pinOrder: Date.now() + idx 
      }));
      await Promise.all(promises);
      setSelectedItemIds(new Set());
      setIsSelectMode(false);
      fetchItems();
    } catch (err) {
      console.error("Failed to batch pin items:", err);
      alert("Failed to pin selected files");
    }
  };

  const clearDragTimeout = () => {
    if (dragExpandTimeoutRef.current) {
      clearTimeout(dragExpandTimeoutRef.current);
      dragExpandTimeoutRef.current = null;
    }
  };

  const isFileDrag = (e) => e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files');

  useEffect(() => {
    const closeDropdown = () => setActiveDropdownId(null);
    window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, []);

  const pinnedFiles = useMemo(() => {
    if (!isAuthenticated) return [];
    const query = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      if (!item.isPinned || item.type !== 'file') return false;
      if (query && !item.name.toLowerCase().includes(query)) return false;
      return true;
    }).sort((a, b) => (a.pinOrder || 0) - (b.pinOrder || 0));
  }, [items, isAuthenticated, searchQuery]);

  // Group items by parent
  const treeData = useMemo(() => {
    if (!isAuthenticated) {
      return { rootItems: [], childrenMap: {} };
    }

    const rootItems = [];
    const childrenMap = {};

    // Group items first, excluding pinned items (they are displayed in the virtual Pinned folder)
    items.forEach(item => {
      if (item.isPinned) return;

      if (!item.parentId) {
        rootItems.push(item);
      } else {
        if (!childrenMap[item.parentId]) childrenMap[item.parentId] = [];
        childrenMap[item.parentId].push(item);
      }
    });

    // Separate Archive folder from other root items
    let archiveFolder = null;
    const regularRootItems = [];
    rootItems.forEach(item => {
      if (item.isArchive) {
        archiveFolder = item;
      } else {
        regularRootItems.push(item);
      }
    });

    // Sort regular rootItems
    regularRootItems.sort((a, b) => {
      if (sortDirection === 'custom') {
        return (a.order || 0) - (b.order || 0);
      }
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
    });

    // Reassemble rootItems with Archive folder handling
    let sortedRootItems = regularRootItems;
    if (archiveFolder) {
      if (sortDirection === 'asc') {
        // Oldest first -> Archive goes to top
        sortedRootItems = [archiveFolder, ...regularRootItems];
      } else {
        // Custom or Newest first -> Archive goes to bottom
        sortedRootItems = [...regularRootItems, archiveFolder];
      }
    }

    // Sort subfolder items
    Object.keys(childrenMap).forEach(parentId => {
      childrenMap[parentId].sort((a, b) => {
        if (sortDirection === 'custom') {
          return (a.order || 0) - (b.order || 0);
        }
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
      });
    });

    let finalRootItems = [...sortedRootItems];
    const finalChildrenMap = {};
    Object.keys(childrenMap).forEach(key => {
      finalChildrenMap[key] = [...childrenMap[key]];
    });

    if (isReversed) {
      finalRootItems.reverse();
      Object.keys(finalChildrenMap).forEach(key => {
        finalChildrenMap[key].reverse();
      });
    }

    return { rootItems: finalRootItems, childrenMap: finalChildrenMap };
  }, [items, isAuthenticated, sortDirection, isReversed]);

  const activeAncestors = useMemo(() => {
    const ancestors = new Set();
    if (!selectedFileId) return ancestors;

    const parentMap = {};
    items.forEach(i => {
      parentMap[i._id] = i.parentId;
    });

    let currentParent = parentMap[selectedFileId];
    const visitedAncestors = new Set();
    while (currentParent && !visitedAncestors.has(currentParent)) {
      visitedAncestors.add(currentParent);
      ancestors.add(currentParent);
      currentParent = parentMap[currentParent];
    }
    return ancestors;
  }, [items, selectedFileId]);

  const toggleFolder = (folderId, e) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleCreate = async (type, parentId = null) => {
    const name = prompt(`Enter ${type} name:`);
    if (!name) return;

    let finalName = name;
    if (type === 'file' && !name.endsWith('.md')) {
      finalName += '.md';
    }

    try {
      const res = await api.post('/items', { name: finalName, type, parentId });
      fetchItems();
      if (type === 'file') {
        onSelectFile(res.data);
      }
      if (parentId) {
        const newExpanded = new Set(expandedFolders);
        newExpanded.add(parentId);
        setExpandedFolders(newExpanded);
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.msg || 'Failed to create item';
      alert(msg);
    }
  };

  const handleUploadClick = (parentId = null, e) => {
    if (e) e.stopPropagation();
    setUploadParentId(parentId);
    if (fileInputRef.current) {
      fileInputRef.current.value = null; // reset
      fileInputRef.current.click();
    }
  };

  const uploadFile = async (file, parentId) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'doc', 'docx', 'md'];
    
    if (!allowedExtensions.includes(ext)) {
      alert('Only PDF, Image, DOCX, and MD files are allowed to be uploaded.');
      return;
    }

    const isMd = ext === 'md';
    const maxSize = 20 * 1024 * 1024; // 20 MB

    if (!isMd && file.size > maxSize) {
      alert('File size exceeds the 20MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target.result;
      try {
        const res = await api.post('/items', {
          name: file.name,
          type: 'file',
          parentId,
          content
        });
        fetchItems();
        onSelectFile(res.data);
        if (parentId) {
          const newExpanded = new Set(expandedFolders);
          newExpanded.add(parentId);
          setExpandedFolders(newExpanded);
        }
      } catch (err) {
        console.error(err);
        const msg = err.response?.data?.msg || 'Failed to upload file';
        alert(msg);
      }
    };

    if (isMd) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    uploadFile(file, uploadParentId);
  };

  // HTML5 Drag and drop for local files
  const handleDragEnter = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (!isAuthenticated) return;
    if (dragCounter.current === 1) setIsDragActive(true);
  };

  const handleDragOver = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) return;

    // Only reset hovered folder if the drag target is NOT over a folder tree-item
    const folderTreeItem = e.target.closest('.tree-item[data-is-folder="true"]');
    if (!folderTreeItem) {
      setDragHoveredFolderId(null);
      clearDragTimeout();
    }
  };

  const handleDragLeave = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragActive(false);
      setDragHoveredFolderId(null);
      clearDragTimeout();
    }
  };

  const handleDrop = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragActive(false);
    const targetFolderId = dragHoveredFolderId;
    setDragHoveredFolderId(null);
    clearDragTimeout();
    if (!isAuthenticated) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => {
        uploadFile(file, targetFolderId); // Upload to target folder or root
      });
    }
  };

  // Folder specific drops
  const handleFolderDragOver = (e, folderId) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) return;

    if (dragHoveredFolderId !== folderId) {
      setDragHoveredFolderId(folderId);

      // Auto-expand folder on drag hover after 800ms
      clearDragTimeout();
      dragExpandTimeoutRef.current = setTimeout(() => {
        setExpandedFolders(prev => {
          const next = new Set(prev);
          next.add(folderId);
          return next;
        });
      }, 800);
    }
  };

  const handleFolderDrop = (e, folderId) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragActive(false);
    setDragHoveredFolderId(null);
    clearDragTimeout();
    if (!isAuthenticated) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => {
        uploadFile(file, folderId); // Upload to folder
      });
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await api.delete(`/items/${id}`);
      if (selectedFileId === id || activeAncestors.has(id)) {
        onSelectFile(null);
      }
      fetchItems();
    } catch (err) {
      console.error(err);
      alert('Failed to delete item');
    }
  };

  const handleRename = async (item, e) => {
    e.stopPropagation();
    const cleanName = item.name.replace(/\.[^/.]+$/, '');
    const inputName = prompt('Enter new name:', cleanName);
    if (!inputName) return;

    let newName = inputName.trim();
    if (!newName) return;

    if (newName === cleanName) return;

    // Client-side duplicate check
    const isDuplicate = items.some(existingItem =>
      existingItem.parentId === item.parentId &&
      existingItem._id !== item._id &&
      existingItem.name.replace(/\.[^/.]+$/, '').toLowerCase() === newName.toLowerCase()
    );

    if (isDuplicate) {
      alert(`An item named "${newName}" already exists in this folder`);
      return;
    }

    try {
      await api.put(`/items/${item._id}`, { name: newName });
      fetchItems();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.msg || 'Failed to rename item';
      alert(msg);
    }
  };

  const handleTogglePin = async (item, e) => {
    if (e) e.stopPropagation();
    try {
      const payload = { isPinned: !item.isPinned };
      if (!item.isPinned) {
        // When pinning, give it the highest possible order so it goes to the bottom
        payload.pinOrder = Date.now();
      }
      await api.put(`/items/${item._id}`, payload);
      fetchItems();
    } catch (err) {
      console.error(err);
      alert('Failed to pin/unpin item');
    }
  };

  const handleUnpinAll = async (e) => {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to unpin all pinned files?")) return;
    try {
      const promises = pinnedFiles.map(file => api.put(`/items/${file._id}`, { isPinned: false }));
      await Promise.all(promises);
      fetchItems();
      setActiveDropdownId(null);
    } catch (err) {
      console.error("Failed to unpin all:", err);
      alert("Failed to unpin all files");
    }
  };

  const handleTogglePinnedSelectItem = (itemId, e) => {
    if (e) e.stopPropagation();
    const newSelected = new Set(selectedPinnedItemIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedPinnedItemIds(newSelected);
  };

  const handleUnpinSelected = async (e) => {
    if (e) e.stopPropagation();
    const selectedPinned = pinnedFiles.filter(file => selectedPinnedItemIds.has(file._id));
    if (selectedPinned.length === 0) {
      alert("Please select one or more pinned files first.");
      return;
    }
    if (!confirm(`Are you sure you want to unpin the ${selectedPinned.length} selected file(s)?`)) return;
    try {
      const promises = selectedPinned.map(file => api.put(`/items/${file._id}`, { isPinned: false }));
      await Promise.all(promises);
      setSelectedPinnedItemIds(new Set());
      setIsPinnedSelectMode(false);
      fetchItems();
      setActiveDropdownId(null);
    } catch (err) {
      console.error("Failed to unpin selected:", err);
      alert("Failed to unpin selected files");
    }
  };

  const onDragEnd = async (result) => {
    if (!isAuthenticated) return;

    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Block custom reordering of normal items if there are pinned files
    if (source.droppableId !== 'pinned' && destination.droppableId !== 'pinned' && pinnedFiles.length > 0) {
      alert("Notice: Please unpin all files to enable custom reordering.");
      return;
    }

    // Drag-and-drop within pinned folder
    if (source.droppableId === 'pinned' || destination.droppableId === 'pinned') {
      if (source.droppableId !== 'pinned' || destination.droppableId !== 'pinned') {
        // Dragging into/out of pinned is not allowed
        return;
      }
      
      const newPinned = [...pinnedFiles];
      const draggedItemIndex = newPinned.findIndex(i => i._id === draggableId);
      if (draggedItemIndex === -1) return;
      const [removed] = newPinned.splice(draggedItemIndex, 1);
      newPinned.splice(destination.index, 0, removed);
      
      const updates = newPinned.map((item, index) => ({
        id: item._id,
        pinOrder: index
      }));
      
      try {
        await api.put('/items/action/reorder', { updates });
        fetchItems();
      } catch (err) {
        console.error(err);
        alert('Failed to reorder pinned files');
      }
      return;
    }

    // Get the new parentId
    const newParentId = destination.droppableId === 'root' ? null : destination.droppableId;

    const draggedItem = items.find(i => i._id === draggableId);
    if (draggedItem && draggedItem.isArchive) return; // Cannot drag/reorder Archive folder

    // Automatically switch to custom sort mode when user drags an item
    if (sortDirection !== 'custom') {
      setSortDirection('custom');
    }

    // Create an optimistic update
    const newItems = [...items];
    const draggedItemIndex = newItems.findIndex(i => i._id === draggableId);
    if (draggedItemIndex > -1) {
      newItems[draggedItemIndex] = {
        ...newItems[draggedItemIndex],
        parentId: newParentId
      };
    }

    // Now we need to recalculate order for the destination children, excluding the Archive folder and pinned items
    const destinationChildren = newItems.filter(i => (i.parentId || 'root') === (newParentId || 'root') && i._id !== draggableId && !i.isArchive && !i.isPinned)
      .sort((a, b) => a.order - b.order);

    let targetIndex = destination.index;
    if (isReversed) {
      const destParentId = destination.droppableId === 'root' ? null : destination.droppableId;
      const destSiblings = items.filter(i => (i.parentId || 'root') === (destParentId || 'root') && !i.isArchive && !i.isPinned);
      let destLength = destSiblings.length;
      if (source.droppableId !== destination.droppableId) {
        destLength += 1;
      }
      let destIndex = destination.index;
      if (destination.droppableId === 'root') {
        destIndex = Math.max(0, destination.index - 1);
      }
      targetIndex = destLength - 1 - destIndex;
    }

    // Insert at new index
    destinationChildren.splice(targetIndex, 0, newItems[draggedItemIndex]);

    // Generate updates
    const updates = destinationChildren.map((item, index) => ({
      id: item._id,
      order: index,
      parentId: newParentId
    }));

    try {
      await api.put('/items/action/reorder', { updates });
      fetchItems();
    } catch (err) {
      console.error(err);
      alert('Failed to reorder items');
    }
  };

  const renderTree = (itemsList, parentIdStr = 'root', paddingLeft = 10) => {
    const displayedItems = filteredTreeData
      ? itemsList.filter(item => filteredTreeData.visibleIds.has(item._id))
      : itemsList;

    return (
      <Droppable droppableId={parentIdStr} type="ITEM">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`droppable-area ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
            style={{ minHeight: displayedItems.length === 0 ? '10px' : 'auto' }}
          >
            {displayedItems.map((item, index) => {
              const isExpanded = expandedFolders.has(item._id);

              return (
                <Draggable key={item._id} draggableId={item._id} index={index} isDragDisabled={isSelectMode || !isAuthenticated || item.isArchive}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      style={{
                        ...provided.draggableProps.style,
                        opacity: snapshot.isDragging ? 0.8 : 1,
                      }}
                    >
                      <div
                        className={`tree-item ${selectedFileId === item._id && !isSelectMode ? 'active' : ''} ${snapshot.isDragging ? 'dragging' : ''} ${item.type === 'folder' && !expandedFolders.has(item._id) && activeAncestors.has(item._id) ? 'contains-active' : ''} ${dragHoveredFolderId === item._id ? 'drag-hover' : ''} ${activeDropdownId === item._id ? 'menu-open' : ''} ${isSelectMode && selectedItemIds.has(item._id) ? 'selected' : ''}`}
                        data-is-folder={item.type === 'folder'}
                        onClick={(e) => {
                          if (isSelectMode) {
                            handleToggleSelectItem(item._id, e);
                          } else {
                            if (item.type === 'file') {
                              onSelectFile(item);
                            } else {
                              toggleFolder(item._id, e);
                            }
                          }
                        }}
                        onDragOver={item.type === 'folder' && !isSelectMode ? (e) => handleFolderDragOver(e, item._id) : undefined}
                        onDrop={item.type === 'folder' && !isSelectMode ? (e) => handleFolderDrop(e, item._id) : undefined}
                      >
                        {isSelectMode && (
                          <div className="tree-item-checkbox-container" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="tree-item-checkbox"
                              checked={selectedItemIds.has(item._id)}
                              onChange={(e) => handleToggleSelectItem(item._id, e)}
                            />
                          </div>
                        )}
                        <div className="tree-item-icon" onClick={(e) => {
                          if (isSelectMode && item.type === 'folder') {
                            e.stopPropagation();
                            toggleFolder(item._id, e);
                          }
                        }}>
                          {item.type === 'folder' ? (
                            isExpanded ? <FaFolderOpen color="#eab308" /> : <FaFolder color="#eab308" />
                          ) : (
                            <FaFileAlt color="#94a3b8" />
                          )}
                        </div>
                        <span className="tree-item-name">{item.name.replace(/\.[^/.]+$/, '')}</span>

                        {!isSelectMode && isAuthenticated && (
                          <div className={`tree-item-actions dropdown-container ${activeDropdownId === item._id ? 'open' : ''}`}>
                            <button
                              className="action-btn"
                              onClick={(e) => { e.stopPropagation(); setActiveDropdownId(activeDropdownId === item._id ? null : item._id); }}
                            >
                              <FaEllipsisV size={12} />
                            </button>
                            {activeDropdownId === item._id && (
                              <div className="dropdown-menu">
                                {item.type === 'folder' && (
                                  <>
                                    <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); handleCreate('file', item._id); setActiveDropdownId(null); }}>
                                      <FaFileAlt size={12} /> Add File
                                    </button>
                                    <button className="dropdown-item" onClick={(e) => { handleUploadClick(item._id, e); setActiveDropdownId(null); }}>
                                      <FaUpload size={12} /> Upload File
                                    </button>
                                    <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); handleCreate('folder', item._id); setActiveDropdownId(null); }}>
                                      <FaFolder size={12} /> Add Folder
                                    </button>
                                  </>
                                )}
                                {item.type === 'file' && (
                                  <button className="dropdown-item" onClick={(e) => { handleTogglePin(item, e); setActiveDropdownId(null); }}>
                                    <FaThumbtack size={12} /> {item.isPinned ? 'Unpin' : 'Pin'}
                                  </button>
                                )}
                                {!item.isArchive && (
                                  <>
                                    <button className="dropdown-item" onClick={(e) => { handleRename(item, e); setActiveDropdownId(null); }}>
                                      <FaEdit size={12} /> Rename
                                    </button>
                                    <button className="dropdown-item" onClick={(e) => { handleDelete(item._id, e); setActiveDropdownId(null); }} style={{ color: 'var(--danger)' }}>
                                      <FaTrash size={12} /> Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Render children if it's an expanded folder */}
                      {item.type === 'folder' && isExpanded && (
                        <div className="tree-children-container">
                          {renderTree(treeData.childrenMap[item._id] || [], item._id)}
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    );
  };

  return (
    <div
      className={`sidebar ${!isOpen ? 'hidden' : ''} ${isDragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
        width: 'var(--sidebar-width)',
        transition: isResizing ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.doc,.docx,.md"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <div className="global-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo-container">
            <img src={logoImg} alt="Logo" className="logo-img" />
          </div>
          <h2 className="brand-title">Code Red Dev</h2>
        </div>
        {isAuthenticated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className={`action-btn ${isReversed ? 'active' : ''}`}
              style={{ color: isReversed ? 'var(--accent)' : 'inherit' }}
              onClick={() => setIsReversed(!isReversed)}
              title="Reverse Order (Temporary)"
            >
              <FaSort size={14} />
            </button>
            <button
              className={`action-btn ${isSelectMode ? 'active' : ''}`}
              style={{ color: isSelectMode ? 'var(--accent)' : 'inherit' }}
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedItemIds(new Set());
              }}
              title="Toggle Select Mode"
            >
              <FaCheckSquare size={14} />
            </button>
            <div className="dropdown-container">
              <button className="action-btn" onClick={(e) => { e.stopPropagation(); setActiveDropdownId(activeDropdownId === 'global' ? null : 'global'); }}>
                <FaPlus />
              </button>
              {activeDropdownId === 'global' && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); handleCreate('file'); setActiveDropdownId(null); }}>
                    <FaFileAlt size={12} /> New File
                  </button>
                  <button className="dropdown-item" onClick={(e) => { handleUploadClick(null, e); setActiveDropdownId(null); }}>
                    <FaUpload size={12} /> Upload File
                  </button>
                  <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); handleCreate('folder'); setActiveDropdownId(null); }}>
                    <FaFolder size={12} /> New Folder
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="sidebar-search-container">
        <div className="search-input-wrapper">
          <FaSearch className="search-icon" />
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Search files & folders..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value) }}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')} title="Clear Search">
              <FaTimes size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="sidebar-content">
        <DragDropContext onDragEnd={onDragEnd}>
          {isAuthenticated && pinnedFiles.length > 0 && (
            <div className="pinned-folder-container" style={{ marginBottom: '15px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <div 
                className={`tree-item virtual-pinned-folder ${activeDropdownId === 'pinned-folder' ? 'menu-open' : ''}`}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '6px 10px', borderRadius: '6px', gap: '8px' }}
                onClick={() => setIsPinnedFolderExpanded(!isPinnedFolderExpanded)}
              >
                <div className="tree-item-icon">
                  {isPinnedFolderExpanded ? <FaFolderOpen color="#3b82f6" /> : <FaFolder color="#3b82f6" />}
                </div>
                <span className="tree-item-name" style={{ fontWeight: '600', color: 'var(--text-main)', flex: 1 }}>Pinned Files</span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                  <button 
                    className={`action-btn ${isPinnedSelectMode ? 'active' : ''}`}
                    style={{ color: isPinnedSelectMode ? 'var(--accent)' : 'inherit' }}
                    onClick={() => {
                      setIsPinnedSelectMode(!isPinnedSelectMode);
                      setSelectedPinnedItemIds(new Set());
                    }}
                    title="Toggle Pinned Select Mode"
                  >
                    <FaCheckSquare size={12} />
                  </button>
                  
                  <div className={`tree-item-actions dropdown-container ${activeDropdownId === 'pinned-folder' ? 'open' : ''}`}>
                    <button 
                      className="action-btn"
                      onClick={(e) => { e.stopPropagation(); setActiveDropdownId(activeDropdownId === 'pinned-folder' ? null : 'pinned-folder'); }}
                    >
                      <FaEllipsisV size={12} />
                    </button>
                    {activeDropdownId === 'pinned-folder' && (
                      <div className="dropdown-menu" style={{ right: 0, top: '24px', display: 'block' }}>
                        <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: '4px', fontWeight: 'bold' }}>
                          Total Pinned: {pinnedFiles.length}
                        </div>
                        <button className="dropdown-item" onClick={handleUnpinAll}>
                          <FaThumbtack size={12} style={{ marginRight: '6px' }} /> Unpin All
                        </button>
                        <button className="dropdown-item" onClick={handleUnpinSelected}>
                          <FaThumbtack size={12} style={{ marginRight: '6px' }} /> Unpin
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {isPinnedFolderExpanded && (
                <Droppable droppableId="pinned" type="ITEM">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="tree-children-container"
                      style={{ paddingLeft: '15px', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px', minHeight: '10px' }}
                    >
                      {pinnedFiles.map((file, index) => (
                        <Draggable key={file._id} draggableId={file._id} index={index} isDragDisabled={isPinnedSelectMode || isSelectMode || !isAuthenticated}>
                          {(providedDrag, snapshotDrag) => (
                            <div 
                              ref={providedDrag.innerRef}
                              {...providedDrag.draggableProps}
                              {...providedDrag.dragHandleProps}
                              className={`tree-item ${selectedFileId === file._id ? 'active' : ''} ${snapshotDrag.isDragging ? 'dragging' : ''} ${isPinnedSelectMode && selectedPinnedItemIds.has(file._id) ? 'selected' : ''}`}
                              style={{ 
                                ...providedDrag.draggableProps.style,
                                display: 'flex', 
                                alignItems: 'center', 
                                padding: '6px 10px', 
                                borderRadius: '6px', 
                                cursor: 'pointer', 
                                gap: '8px',
                                opacity: snapshotDrag.isDragging ? 0.8 : 1
                              }}
                              onClick={(e) => {
                                if (isPinnedSelectMode) {
                                  handleTogglePinnedSelectItem(file._id, e);
                                } else {
                                  onSelectFile(file);
                                }
                              }}
                            >
                              {isPinnedSelectMode && (
                                <div className="tree-item-checkbox-container" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="tree-item-checkbox"
                                    checked={selectedPinnedItemIds.has(file._id)}
                                    onChange={(e) => handleTogglePinnedSelectItem(file._id, e)}
                                  />
                                </div>
                              )}
                              <div className="tree-item-icon">
                                <FaFileAlt color="#3b82f6" />
                              </div>
                              <span className="tree-item-name" style={{ flex: 1 }}>{file.name.replace(/\.[^/.]+$/, '')}</span>
                              <div className="tree-item-actions dropdown-container">
                                <button 
                                  className="action-btn"
                                  onClick={(e) => { e.stopPropagation(); setActiveDropdownId(activeDropdownId === `pinned-${file._id}` ? null : `pinned-${file._id}`); }}
                                >
                                  <FaEllipsisV size={12} />
                                </button>
                                {activeDropdownId === `pinned-${file._id}` && (
                                  <div className="dropdown-menu" style={{ right: 0, top: '24px', display: 'block' }}>
                                    <button className="dropdown-item" onClick={(e) => { handleRename(file, e); setActiveDropdownId(null); }}>
                                      <FaEdit size={12} style={{ marginRight: '6px' }} /> Rename
                                    </button>
                                    <button className="dropdown-item" onClick={(e) => { handleTogglePin(file, e); setActiveDropdownId(null); }}>
                                      <FaThumbtack size={12} style={{ marginRight: '6px' }} /> Unpin
                                    </button>
                                    <button className="dropdown-item text-danger" onClick={(e) => { handleDelete(file._id, e); setActiveDropdownId(null); }}>
                                      <FaTrash size={12} style={{ marginRight: '6px' }} /> Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              )}
            </div>
          )}
          {renderTree(treeData.rootItems)}
        </DragDropContext>
      </div>
      {isSelectMode && (
        <div className="batch-actions-panel">
          <div className="batch-actions-info">
            <span>{selectedItemIds.size} Selected</span>
          </div>
          <div className="batch-actions-btns">
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => { setIsSelectMode(false); setSelectedItemIds(new Set()); }}>
              Cancel
            </button>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', gap: '6px', color: 'var(--text-main)', border: '1px solid var(--border)' }} onClick={handleBatchPin} disabled={selectedItemIds.size === 0}>
              <FaThumbtack size={12} style={{ color: 'var(--accent)' }} /> Pin
            </button>
            <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.85rem', gap: '6px' }} onClick={handleBatchDelete} disabled={selectedItemIds.size === 0}>
              <FaTrash size={12} /> Delete
            </button>
          </div>
        </div>
      )}
      <div className="sidebar-footer" style={{ flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '10px' }}>
          <div style={{ display: 'flex', flex: 1, justifyContent: 'center', gap: '10px', backgroundColor: 'var(--bg-dark)', padding: '5px', borderRadius: '8px' }}>
            <button className={`action-btn ${themeMode === 'light' ? 'active' : ''}`} style={{ color: themeMode === 'light' ? 'var(--accent)' : '' }} onClick={() => setThemeMode('light')} title="Light Mode"><FaSun /></button>
            <button className={`action-btn ${themeMode === 'dark' ? 'active' : ''}`} style={{ color: themeMode === 'dark' ? 'var(--accent)' : '' }} onClick={() => setThemeMode('dark')} title="Dark Mode"><FaMoon /></button>
            <button className={`action-btn ${themeMode === 'system' ? 'active' : ''}`} style={{ color: themeMode === 'system' ? 'var(--accent)' : '' }} onClick={() => setThemeMode('system')} title="System Mode"><FaDesktop /></button>
          </div>
          <button 
            className="action-btn esc-btn"
            onClick={() => onSelectFile(null)}
            disabled={!selectedFileId}
            title="Deselect File (ESC)"
          >
            ESC
          </button>
        </div>
        {isAuthenticated ? (
          <button className="btn btn-danger" style={{ width: '100%' }} onClick={logout}>Logout</button>
        ) : (
          <button className="btn" style={{ width: '100%' }} onClick={() => navigate('/login')}>Login</button>
        )}
      </div>
      <div 
        className="sidebar-resizer" 
        onMouseDown={initResize}
        onTouchStart={initResize}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '5px',
          height: '100%',
          cursor: 'col-resize',
          zIndex: 1000,
          background: isResizing ? 'var(--accent)' : 'transparent',
          transition: 'background 0.2s',
          maxWidth: '80vw',
          transform: 'translateX(0)'
        }}
      />
    </div>
  );
};

export default Sidebar;

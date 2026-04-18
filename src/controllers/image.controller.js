import fs, { link } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Image } from '../models/image.model.js';
import { generateThumbnail, getImageDimensions } from '../utils/thumbnail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * TODO: Upload image
 *
 * 1. Check if file uploaded (if !req.file, return 400 "No file uploaded")
 * 2. Get file info from req.file (filename, originalname, mimetype, size)
 * 3. Get image dimensions using getImageDimensions(filepath)
 * 4. Generate thumbnail using generateThumbnail(filename)
 * 5. Extract optional fields from req.body (description, tags)
 *    - Parse tags: split by comma and trim each tag
 * 6. Save metadata to database (Image.create)
 * 7. Return 201 with image metadata
 */
export async function uploadImage(req, res, next) {
  try {
    // Your code here
    if (req.body.err) return res.status(400).json({ error: { message: req.body.err } })
    if (!req.file) return res.status(400).json({ error: { message: "No file uploaded || invalid file type" } });
    const { filename, originalname, mimetype, size, path } = req.file;
    const { width, height } = await getImageDimensions(path);
    const thumbnailFilename = await generateThumbnail(filename);
    let { description, tags } = req.body;
    tags = tags ? tags.split(',').map(ele => ele.trim()) : [];
    const createdImage = await Image.create({
      originalName: originalname,
      filename,
      mimetype,
      size,
      width,
      height,
      thumbnailFilename,
      description,
      tags
    }
    );
    return res.status(201).json(createdImage)

  } catch (error) {
    next(error);
  }
}

/**
 * TODO: List images with pagination and filtering
 *
 * 1. Extract query parameters:
 *    - page (default 1)
 *    - limit (default 10, max 50)
 *    - search (search in originalName and description)
 *    - mimetype (filter by mimetype)
 *    - sortBy (field to sort by, default 'uploadDate')
 *    - sortOrder (asc or desc, default 'desc')
 *
 * 2. Build MongoDB query:
 *    - Add text search if search parameter provided
 *    - Add mimetype filter if provided
 *
 * 3. Calculate pagination:
 *    - skip = (page - 1) * limit
 *    - total = await Image.countDocuments(query)
 *    - pages = Math.ceil(total / limit)
 *
 * 4. Fetch images with sorting and pagination:
 *    - Image.find(query).sort({[sortBy]: sortOrder === 'asc' ? 1 : -1}).skip(skip).limit(limit)
 *
 * 5. Calculate totalSize (sum of all image sizes)
 *
 * 6. Return 200 with:
 *    - data: images array
 *    - meta: { total, page, limit, pages, totalSize }
 */
export async function listImages(req, res, next) {
  try {
    const { search, mimetype, sortby, sortorder } = req.query;
    /** * 2. Build MongoDB query:
 *    - Add text search if search parameter provided
 *    - Add mimetype filter if provided */
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    let query = {}
    if (search) query = {
      $or: [
        { originalName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    };
    if (mimetype) query.mimetype = mimetype;

    const [queryResult, totalCount] = await Promise.all([
      Image.find(query).sort({ [sortby || 'uploadDate']: sortorder ? sortorder === 'asc' ? 1 : -1 : -1 }).limit(limit).skip(skip),
      Image.countDocuments(query)
    ]);
    const pageCount = Math.ceil(totalCount / limit);

    const totalSize = queryResult.reduce((init, ele) => init + ele.size, 0);

    return res.status(200).json({ data: queryResult, meta: { total: totalCount, page, limit, pages: pageCount, totalSize } });


  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Get image metadata by ID
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Return 200 with image metadata
 */
export async function getImage(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ error: { message: "Image not found" } });
    return res.status(200).json(image);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download original image
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Construct file path
 * 4. Check if file exists using fs.existsSync()
 * 5. If file missing: return 404 "File not found"
 * 6. Set headers:
 *    - Content-Type: image.mimetype
 *    - Content-Disposition: attachment; filename="originalName"
 * 7. Send file using res.sendFile(filepath)
 */
export async function downloadImage(req, res, next) {
  try {
    const fetchedImage = await Image.findById(req.params.id);
    if (!fetchedImage) return res.status(404).json({ error: { message: `Image not found` } });
    const filepath = path.join(__dirname, '../../uploads/', fetchedImage.filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: { message: `File not found` } });
    res.set({
      "Content-Type": fetchedImage.mimetype,
      "Content-Disposition": `attachment; filename="${fetchedImage.originalName}"`
    })
    return res.sendFile(filepath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download thumbnail
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Construct thumbnail path
 * 4. Check if thumbnail exists
 * 5. If missing: return 404 "File not found"
 * 6. Set headers:
 *    - Content-Type: image/jpeg (thumbnails are always JPEG)
 * 7. Send file using res.sendFile(thumbnailPath)
 */
export async function downloadThumbnail(req, res, next) {
  try {
    // Your code here
    const thumbnail = await Image.findById(req.params.id);
    if (!thumbnail) return res.status(404).json({ error: { message: "Image not found" } });

    const filepath = path.join(__dirname, '../../uploads/thumbnails', thumbnail.thumbnailFilename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: { message: "File not found" } });
    res.set({
      "Content-Type": 'image/jpeg',
      "Content-Disposition": `attachment; filename="${thumbnail.originalName}"`
    })
    res.sendFile(filepath)
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Delete image
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Delete original file (use try-catch, ignore ENOENT errors)
 * 4. Delete thumbnail (use try-catch, ignore ENOENT errors)
 * 5. Delete metadata from database
 * 6. Return 204 (no content)
 */
export async function deleteImage(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ error: { message: "Image not found" } });
    const filepathi = path.join(__dirname, '../../uploads/', image.filename);
    const filepatht = path.join(__dirname, '../../uploads/thumbnails', image.thumbnailFilename);

    try {
      fs.unlinkSync(filepathi);
      fs.unlinkSync(filepatht);

    } catch (e) { }
    await Image.findByIdAndDelete(req.params.id)
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}

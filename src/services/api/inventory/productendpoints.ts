import { ipcMain } from 'electron';
import Product, { ProductAttributes } from '../../../models/Product.js';
import Shop from '../../../models/Shop.js';
import Category from '../../../models/Category.js';
import Supplier from '../../../models/Supplier.js';
import { Op } from 'sequelize';

// IPC Channel names
const IPC_CHANNELS = {
  CREATE_PRODUCT: 'inventory:product:create',
  GET_ALL_PRODUCTS: 'inventory:product:get-all',
  GET_PRODUCT: 'inventory:product:get',
  UPDATE_PRODUCT: 'inventory:product:update',
  DELETE_PRODUCT: 'inventory:product:delete',
  GET_BY_CATEGORY: 'inventory:product:get-by-category'
};

// Register IPC handlers
export function registerProductHandlers() {
  // Create product handler
  ipcMain.handle(IPC_CHANNELS.CREATE_PRODUCT, async (event, { data }) => {
    try {
      if (!data.businessId) {
        return { success: false, message: 'Business ID is required' };
      }

      // Sanitize the input data to ensure it's serializable
      const sanitizedData = {
        name: data.name,
        sku: data.sku,
        sellingPrice: Number(data.sellingPrice),
        quantity: Number(data.quantity),
        description: data.description,
        category_id: data.category_id,
        shop_id: data.shop_id,
        status: (data.quantity <= data.reorderPoint ? 'low_stock' : 
                data.quantity <= data.reorderPoint * 2 ? 'medium_stock' : 
                'high_stock') as 'low_stock' | 'medium_stock' | 'high_stock' | 'out_of_stock',
        unitType: data.unitType,
        purchasePrice: Number(data.purchasePrice),
        featuredImage: data.featuredImage,
        additionalImages: Array.isArray(data.additionalImages) ? data.additionalImages : [],
        reorderPoint: Number(data.reorderPoint),
        businessId: data.businessId
      };

      // Create the product with sanitized data
      const product = await Product.create(sanitizedData);

      // Handle supplier associations separately
      if (data.suppliers && Array.isArray(data.suppliers)) {
        await product.addSuppliers(data.suppliers);
      }

      // Fetch the product with associations, but sanitize the response
      const productWithAssociations = await Product.findByPk(product.id, {
        include: [
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name']
          },
          {
            model: Shop,
            as: 'shop',
            attributes: ['id', 'name']
          },
          {
            model: Supplier,
            as: 'suppliers',
            through: { attributes: [] },
            attributes: ['id', 'name']
          }
        ]
      });

      // Convert to plain object and remove any circular references
      const plainProduct = productWithAssociations?.get({ plain: true });

      return { 
        success: true, 
        message: 'Product created successfully', 
        product: plainProduct
      };
    } catch (error) {
      console.error('Error creating product:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Error creating product'
      };
    }
  });

  // Get all products handler
  ipcMain.handle(IPC_CHANNELS.GET_ALL_PRODUCTS, async (event, { shopId, shopIds }) => {
    try {
      // Only create whereClause if we have valid shop identifiers
      let whereClause = {};
      
      if (shopIds && shopIds.length > 0) {
        whereClause = { shop_id: { [Op.in]: shopIds } };
      } else if (shopId) {
        whereClause = { shop_id: shopId };
      } else {
        throw new Error('No valid shop identifier provided');
      }

      const products = await Product.findAll({
        where: whereClause,
        include: [
          {
            model: Category,
            as: 'category'
          },
          {
            model: Shop,
            as: 'shop'
          },
          {
            model: Supplier,
            as: 'suppliers',
            through: { attributes: [] }
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      return { success: true, products };
    } catch (error) {
      console.error('Error fetching products:', error);
      return { 
        success: false, 
        message: 'Error fetching products',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get product by ID handler
  ipcMain.handle(IPC_CHANNELS.GET_PRODUCT, async (event, { id }) => {
    try {
      const product = await Product.findByPk(id, {
        include: ['category']
      });
      if (!product) {
        return { success: false, message: 'Product not found' };
      }
      return { success: true, product };
    } catch (error) {
      return { success: false, message: 'Error retrieving product', error };
    }
  });

  // Update product handler
  ipcMain.handle(IPC_CHANNELS.UPDATE_PRODUCT, async (event, { id, updates }) => {
    try {
      const product = await Product.findByPk(id);
      if (!product) {
        return { success: false, message: 'Product not found' };
      }
      
      // Update status based on new quantity if it's being updated
      if (updates.quantity !== undefined) {
        updates.status = updates.quantity <= (product.reorderPoint ?? 10) ? 'low_stock' :
                        updates.quantity <= (product.reorderPoint ?? 10) * 2 ? 'medium_stock' : 
                        'high_stock';
      }
      
      await product.update(updates);
      return { success: true, message: 'Product updated successfully', product };
    } catch (error) {
      return { success: false, message: 'Error updating product', error };
    }
  });

  // Get products by category handler
  ipcMain.handle(IPC_CHANNELS.GET_BY_CATEGORY, async (event, { categoryId, shop_id }) => {
    try {
      const products = await Product.findAll({
        where: { 
          category_id: categoryId,
          shop_id 
        },
        include: ['category'],
        order: [['createdAt', 'DESC']]
      });
      return { success: true, products };
    } catch (error) {
      return { success: false, message: 'Error fetching products by category', error };
    }
  });

  // Delete product handler
  ipcMain.handle(IPC_CHANNELS.DELETE_PRODUCT, async (event, { id }) => {
    try {
      const product = await Product.findByPk(id);
      if (!product) {
        return { success: false, message: 'Product not found' };
      }
      await product.destroy();
      return { success: true, message: 'Product deleted successfully' };
    } catch (error) {
      return { success: false, message: 'Error deleting product', error };
    }
  });
}

// Export channel names for use in renderer process
export { IPC_CHANNELS };
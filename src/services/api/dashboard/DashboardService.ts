import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { sequelize } from '../../database/index.js';
import StockMovement from '../../../models/StockMovement.js';
import InventoryItem from '../../../models/InventoryItem.js';
import Product from '../../../models/Product.js';
import Supplier from '../../../models/Supplier.js';
import Shop from '../../../models/Shop.js';
import Sales from '../../../models/Sales.js';
import { Op, fn, col, literal } from 'sequelize';
import Category from '../../../models/Category.js';
import { fn as sequelizeFn, col as sequelizeCol, literal as sequelizeLiteral } from 'sequelize';

interface SalesAggregateResult {
  total_sales: number;
  total_orders: number;
}

interface CategoryAggregateResult {
  id: string;
  name: string;
  period: string;
  product_count: string;
  total_items: string;
  total_value: string;
}

// export const IPC_CHANNELS = {
//   GET_INVENTORY_DASHBOARD: 'dashboard:inventory:get',
//   GET_SALES_DASHBOARD: 'dashboard:sales:get',
//   GET_TOP_PRODUCTS: 'dashboard:products:top',
//   GET_TOP_SUPPLIERS: 'dashboard:suppliers:top',
//   GET_INVENTORY_TRENDS: 'dashboard:inventory:trends',
// };

// Define a type alias for grouping:
type GroupingType = string | ReturnType<typeof sequelizeFn> | ReturnType<typeof sequelizeCol>;

export function registerDashboardHandlers() {
  // Get Inventory Dashboard Data
  ipcMain.handle('dashboard:inventory:get', async (event: IpcMainInvokeEvent, { businessId, shopId }) => {
    try {
      const whereClause = shopId ? { shopId } : { '$shop.businessId$': businessId };
      
      // Get inventory statistics
      const inventoryStats = await InventoryItem.findAll({
        include: [{
          model: Product,
          as: 'product',
          required: true,
          include: [{
            model: Shop,
            where: whereClause
          }]
        }],
        attributes: [
          [sequelize.fn('SUM', sequelize.col('quantity')), 'total_quantity'],
          [sequelize.fn('SUM', sequelize.literal('quantity * unit_cost')), 'total_value'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'total_items'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN quantity <= reorder_point THEN 1 END')), 'low_stock']
        ],
        raw: true
      });

      // Get last 7 days inventory trends
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const dailyMovements = await StockMovement.findAll({
        where: {
          createdAt: {
            [Op.gte]: sevenDaysAgo
          },
          ...(shopId && { source_inventory_id: shopId })
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN direction = "inbound" THEN quantity ELSE -quantity END')), 'net_change']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
        raw: true
      });

      // Get top suppliers
      const topSuppliers = await Supplier.findAll({
        include: [{
          model: InventoryItem,
          attributes: [],
          include: [{
            model: Product,
            attributes: [],
            include: [{
              model: Shop,
              where: whereClause
            }]
          }]
        }],
        attributes: [
          'name',
          [sequelize.fn('COUNT', sequelize.col('InventoryItems.id')), 'items'],
          [sequelize.fn('SUM', sequelize.literal('InventoryItems.quantity * InventoryItems.unit_cost')), 'value']
        ],
        group: ['Supplier.id'],
        order: [[sequelize.literal('value'), 'DESC']],
        limit: 5,
        raw: true
      });

      // Get top products
      const topProducts = await Product.findAll({
        include: [{
          model: Shop,
          where: whereClause
        }],
        attributes: [
          'name',
          'sku',
          'featuredImage',
          [sequelize.fn('SUM', sequelize.col('InventoryItems.quantity')), 'inStock'],
          [sequelize.literal('SUM(InventoryItems.quantity * InventoryItems.selling_price)'), 'value']
        ],
        group: ['Product.id'],
        order: [[sequelize.literal('value'), 'DESC']],
        limit: 4,
        raw: true
      });

      return {
        success: true,
        data: {
          stats: inventoryStats[0],
          trends: dailyMovements,
          topSuppliers,
          topProducts
        }
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch dashboard data'
      };
    }
  });

  // Get Sales Dashboard Data
  ipcMain.handle('dashboard:sales:get', async (event: IpcMainInvokeEvent, { businessId, shopId, dateRange }) => {
    try {
      const whereClause = shopId ? { shopId } : { '$shop.businessId$': businessId };
      const dateWhereClause = dateRange ? {
        createdAt: {
          [Op.between]: [dateRange.start, dateRange.end]
        }
      } : {};

      // Get sales statistics
      const [salesStats] = await Sales.findAll({
        where: {
          ...dateWhereClause
        },
        include: [{
          model: Shop,
          as: 'shop',
          where: whereClause,
          required: true
        }],
        attributes: [
          [sequelize.fn('SUM', sequelize.col('netAmount')), 'total_sales'],
          [sequelize.fn('COUNT', sequelize.literal('DISTINCT Sales.id')), 'total_orders']
        ],
        raw: true
      }) as unknown as SalesAggregateResult[];

      return {
        success: true,
        data: {
          weeklyStats: {
            totalItems: salesStats?.total_orders || 0,
            totalRevenue: salesStats?.total_sales || 0
          }
        }
      };
    } catch (error) {
      console.error('Error in sales dashboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch sales dashboard data'
      };
    }
  });

  // Get Top Categories
  ipcMain.handle('dashboard:categories:top', async (event: IpcMainInvokeEvent, { 
    businessId,
    shopId,
    dateRange,
    view
  }) => {
    try {
      const topCategories = await getTopCategories(businessId, shopId, dateRange, view);
      return {
        success: true,
        data: topCategories
      };
    } catch (error) {
      console.error('Error fetching top categories:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch top categories'
      };
    }
  });
}

async function getTopCategories(
  businessId: string, 
  shopId?: string,
  dateRange?: { start: string; end: string },
  view: 'daily' | 'weekly' | 'monthly' = 'daily',
  limit = 5
) {
  const whereClause: any = {
    businessId
  };

  if (shopId) {
    whereClause.shopId = shopId;
  }

  if (dateRange) {
    whereClause.createdAt = {
      [Op.between]: [dateRange.start, dateRange.end]
    };
  }

  // Add time grouping based on view
  const timeGrouping = view === 'monthly' 
    ? sequelizeFn('strftime', '%Y-%m', sequelizeCol('products.createdAt'))
    : view === 'weekly'
    ? sequelizeFn('strftime', '%Y-%W', sequelizeCol('products.createdAt'))
    : sequelizeFn('date', sequelizeCol('products.createdAt'));

  const topCategories = await Category.findAll({
    attributes: [
      'id',
      'name',
      [timeGrouping, 'period'],
      [sequelizeFn('COUNT', sequelizeCol('products.id')), 'product_count'],
      [sequelizeFn('SUM', sequelizeCol('products.quantity')), 'total_items'],
      [sequelizeFn('SUM', sequelizeLiteral('products.quantity * products.sellingPrice')), 'total_value']
    ],
    include: [{
      model: Product,
      as: 'products',
      attributes: [],
      include: [{
        model: Shop,
        as: 'shop',
        where: whereClause
      }]
    }],
    group: ['Category.id', 'period'],
    order: [[sequelizeLiteral('total_value'), 'DESC']],
    limit,
    raw: true
  });

  return (topCategories as unknown as CategoryAggregateResult[]).map((category) => ({
    id: category.id,
    name: category.name,
    period: category.period,
    productCount: parseInt(category.product_count),
    totalItems: parseInt(category.total_items),
    totalValue: parseFloat(category.total_value),
    color: '#' + Math.floor(Math.random()*16777215).toString(16)
  }));
}

// export { IPC_CHANNELS };

const getTimeGrouping = (view: string) => {
  switch (view) {
    case 'minutes':
      // Group timestamps into 5-minute intervals
      return sequelizeLiteral("strftime('%Y-%m-%d %H:', createdAt) || substr('00' || (CAST(strftime('%M', createdAt) AS INTEGER) / 5 * 5), -2, 2)");
    case 'hourly':
      return sequelizeFn('strftime', '%Y-%m-%d %H', sequelizeCol('createdAt'));
    case 'daily':
      return sequelizeFn('DATE', sequelizeCol('createdAt'));
    case 'weekly':
      return sequelizeFn('WEEK', sequelizeCol('createdAt'));
    case 'monthly':
      return sequelizeFn('MONTH', sequelizeCol('createdAt'));
    default:
      return sequelizeFn('DATE', sequelizeCol('createdAt'));
  }
};

const getFinanceData = async (
  businessId: string,
  shopId: string | null,
  dateRange: { start: string; end: string } | undefined,
  view: 'minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly'
) => {
  const timeGroup = getTimeGrouping(view);
  
  // Adjust the date range based on view
  let adjustedRange = dateRange;
  if (view === 'minutes' || view === 'hourly') {
    // For minute/hour views, limit to last 24 hours if no range specified
    if (!dateRange) {
      const end = new Date();
      const start = new Date(end);
      start.setHours(end.getHours() - 24);
      adjustedRange = {
        start: start.toISOString(),
        end: end.toISOString()
      };
    }
  }

  const whereClause: any = { businessId };
  if (shopId) whereClause.shopId = shopId;
  if (adjustedRange) {
    whereClause.createdAt = {
      [Op.between]: [adjustedRange.start, adjustedRange.end]
    };
  }

  // Get the grouping value (timeGroup can be either a fn or a literal)
  const grouping = timeGroup as unknown as GroupingType;

  // Update your queries to use the timeGroup
  const monthlyData = await Sales.findAll({
    attributes: [
      [timeGroup, 'name'],
      [sequelizeFn('SUM', sequelizeCol('netAmount')), 'income'],
    ],
    where: whereClause,
    group: [grouping],
    order: [[grouping, 'ASC']],
    raw: true,
  });

  // Similar updates for sales trends
  const salesTrends = await Sales.findAll({
    attributes: [
      [timeGroup, 'day'],
      [sequelizeFn('SUM', sequelizeCol('total')), 'sales'],
    ],
    where: whereClause,
    group: [grouping],
    order: [[grouping, 'ASC']],
    raw: true
  });

  return {
    monthlyData,
    salesTrends,
    // ... other data
  };
};
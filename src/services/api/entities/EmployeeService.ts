import { ipcMain } from 'electron';
import Employee, { EmployeeAttributes } from '../../../models/Employee.js';
import User from '../../../models/User.js';
import Sales from '../../../models/Sales.js';
import { Op } from 'sequelize';
import { sequelize } from '../../database/index.js';
import bcrypt from 'bcrypt';
import Shop from '../../../models/Shop.js';


// IPC Channel names
const IPC_CHANNELS = {
  CREATE_EMPLOYEE: 'entities:employee:create',
  GET_ALL_EMPLOYEES: 'entities:employee:get-all',
  GET_EMPLOYEE: 'entities:employee:get',
  UPDATE_EMPLOYEE: 'entities:employee:update',
  DELETE_EMPLOYEE: 'entities:employee:delete',
  GET_EMPLOYEE_SALES: 'entities:employee:get-sales',
  GET_EMPLOYEE_INCOME: 'entities:employee:get-income'
};

// Register IPC handlers
export function registerEmployeeHandlers() {
  // Create employee handler
  ipcMain.handle(IPC_CHANNELS.CREATE_EMPLOYEE, async (event, { employeeData }) => {
    const t = await sequelize.transaction();
    
    try {
      // Create user account first
      const hashedPassword = await bcrypt.hash(employeeData.password_hash, 10);
      const user = await User.create({
        username: employeeData.username,
        email: employeeData.email,
        password_hash: hashedPassword,
        role: employeeData.role,
        shopId: employeeData.shopId
      }, { transaction: t });

      // Create employee record
      const employee = await Employee.create({
        ...employeeData,
        userId: user.id,
        hireDate: new Date(),
        status: 'active'
      }, { 
        transaction: t,
        include: [{
          model: User,
          as: 'user'
        }]
      });

      await t.commit();
      
      // Fetch the complete employee record with associations and serialize it
      const completeEmployee = await Employee.findByPk(employee.id, {
        include: [{
          model: User,
          as: 'user',
          attributes: ['username', 'email', 'role']
        }, {
          model: Shop,
          as: 'shop',
          attributes: ['name']
        }]
      });

      if (!completeEmployee) {
        throw new Error('Failed to fetch created employee');
      }

      const serializedEmployee = {
        id: completeEmployee.id,
        firstName: completeEmployee.firstName,
        lastName: completeEmployee.lastName,
        phone: completeEmployee.phone,
        status: completeEmployee.status,
        hireDate: completeEmployee.hireDate,
        employmentStatus: completeEmployee.employmentStatus,
        salary: completeEmployee.salary,
        shopId: completeEmployee.shopId,
        businessId: completeEmployee.businessId,
        user: {
          username: (completeEmployee as any).user?.username,
          email: (completeEmployee as any).user?.email,
          role: (completeEmployee as any).user?.role
        },
        shop: {
          name: completeEmployee.shop?.name
        }
      };

      return { 
        success: true, 
        message: 'Employee created successfully', 
        employee: serializedEmployee 
      };
    } catch (error) {
      await t.rollback();
      console.error('Error creating employee:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Error creating employee' 
      };
    }
  });

  // Get all employees handler
  ipcMain.handle(IPC_CHANNELS.GET_ALL_EMPLOYEES, async (event, { businessId }) => {
    try {
      // Add debug logging
      console.log('Received businessId:', businessId);

      // Validate businessId
      if (!businessId) {
        console.log('Business ID is missing');
        return { 
          success: false, 
          message: 'Business ID is required',
          employees: [] 
        };
      }

      // Add type checking
      if (typeof businessId !== 'string' && typeof businessId !== 'number') {
        console.log('Invalid business ID type:', typeof businessId);
        return {
          success: false,
          message: 'Invalid business ID format',
          employees: []
        };
      }

      const employees = await Employee.findAll({
        where: { businessId: String(businessId) },
        include: [
          { 
            model: User, 
            as: 'user',
            attributes: ['username', 'email', 'role'] 
          },
          {
            model: Shop,
            as: 'shop',
            attributes: ['name']
          }
        ],
        order: [['createdAt', 'DESC']]
      }) as (Employee & { user: User; shop: Shop })[];

      // Serialize the employees data
      const serializedEmployees = employees.map(employee => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: employee.phone,
        status: employee.status,
        hireDate: employee.hireDate,
        employmentStatus: employee.employmentStatus,
        salary: employee.salary,
        shopId: employee.shopId,
        businessId: employee.businessId,
        user: employee.user ? {
          username: employee.user.username,
          email: employee.user.email,
          role: employee.user.role
        } : null,
        shop: employee.shop ? {
          name: employee.shop.name
        } : null
      }));

      console.log(`Found ${employees.length} employees`);
      return { 
        success: true, 
        employees: serializedEmployees 
      };
    } catch (error) {
      console.error('Error fetching employees:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Error fetching employees',
        employees: [] 
      };
    }
  });

  // Get employee by ID handler
  ipcMain.handle(IPC_CHANNELS.GET_EMPLOYEE, async (event, { id }) => {
    try {
      const employee = await Employee.findByPk(id, {
        include: [
          { 
            model: User, 
            as: 'user',
            attributes: ['username', 'email', 'role'] 
          },
          'shop',
          'sales'
        ]
      });
      
      if (!employee) {
        return { success: false, message: 'Employee not found' };
      }
      
      return { success: true, employee };
    } catch (error) {
      console.error('Error retrieving employee:', error);
      return { success: false, message: 'Error retrieving employee', error };
    }
  });

  // Update employee handler
  ipcMain.handle(IPC_CHANNELS.UPDATE_EMPLOYEE, async (event, { id, updates }) => {
    const t = await sequelize.transaction();
    
    try {
      const employee = await Employee.findByPk(id, {
        include: [{
          model: User,
          as: 'user'
        }]
      });

      if (!employee) {
        await t.rollback();
        return { success: false, message: 'Employee not found' };
      }

      // Update employee data
      await employee.update(updates, { transaction: t });

      // Update associated user data if provided
      if (updates.email) {
        await User.update({
          email: updates.email,
          shopId: updates.shopId
        }, { 
          where: { id: employee.userId },
          transaction: t 
        });
      }

      await t.commit();

      // Fetch updated employee with associations
      const updatedEmployee = await Employee.findByPk(id, {
        include: [{
          model: User,
          as: 'user',
          attributes: ['username', 'email', 'role']
        }, {
          model: Shop,
          as: 'shop',
          attributes: ['name']
        }]
      });

      return { 
        success: true, 
        message: 'Employee updated successfully', 
        employee: updatedEmployee 
      };
    } catch (error) {
      await t.rollback();
      console.error('Error updating employee:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Error updating employee' 
      };
    }
  });

  // Delete employee handler
  ipcMain.handle(IPC_CHANNELS.DELETE_EMPLOYEE, async (event, { id }) => {
    const t = await sequelize.transaction();
    
    try {
      const employee = await Employee.findByPk(id);
      if (!employee) {
        await t.rollback();
        return { success: false, message: 'Employee not found' };
      }

      // Delete employee
      await employee.destroy({ transaction: t });

      // Delete associated user account
      if (employee.userId) {
        const user = await User.findByPk(employee.userId);
        if (user) {
          await user.destroy({ transaction: t });
        }
      }

      await t.commit();
      return { success: true, message: 'Employee deleted successfully' };
    } catch (error) {
      await t.rollback();
      console.error('Error deleting employee:', error);
      return { success: false, message: 'Error deleting employee', error };
    }
  });

  // Get employee sales handler
  ipcMain.handle(IPC_CHANNELS.GET_EMPLOYEE_SALES, async (event, { id, startDate, endDate }) => {
    try {
      const employee = await Employee.findByPk(id, {
        include: [{
          model: Sales,
          as: 'sales',
          where: {
            createdAt: {
              [Op.between]: [startDate, endDate]
            }
          }
        }]
      });

      if (!employee) {
        return { success: false, message: 'Employee not found' };
      }

      return { success: true, sales: employee.sales };
    } catch (error) {
      console.error('Error fetching employee sales:', error);
      return { success: false, message: 'Error fetching employee sales', error };
    }
  });

  // Get employee income handler
  // ipcMain.handle(IPC_CHANNELS.GET_EMPLOYEE_INCOME, async (event, { id, startDate, endDate }) => {
  //   try {
  //     const sales = await Sales.findAll({
  //       where: {
  //         employeeId: id,
  //         createdAt: {
  //           [Op.between]: [startDate, endDate]
  //         }
  //       },
  //       include: [
  //         {
  //           model: Receipt,
  //           as: 'receipt',
  //           include: [{
  //             model: Payment,
  //             as: 'payment',
  //             include: [{
  //               model: Income,
  //               as: 'income',
  //               where: {
  //                 ohadaCodeId: '701' // Sales of goods
  //               }
  //             }]
  //           }]
  //         },
  //         {
  //           model: Invoice,
  //           as: 'invoice',
  //           include: [{
  //             model: Payment,
  //             as: 'payment',
  //             include: [{
  //               model: Income,
  //               as: 'income',
  //               where: {
  //                 ohadaCodeId: '701'
  //               }
  //             }]
  //           }]
  //         }
  //       ]
  //     });

  //     const totalIncome = sales.reduce((sum, sale) => {
  //       const receiptIncome = sale.receipt?.payment?.income?.amount || 0;
  //       const invoiceIncome = sale.invoice?.payment?.income?.amount || 0;
  //       return sum + receiptIncome + invoiceIncome;
  //     }, 0);

  //     return { 
  //       success: true, 
  //       income: {
  //         total: totalIncome,
  //         sales: sales
  //       }
  //     };
  //   } catch (error) {
  //     console.error('Error fetching employee income:', error);
  //     return { success: false, message: 'Error fetching employee income', error };
  //   }
  // });
}

// Export channel names for use in renderer process
export { IPC_CHANNELS };
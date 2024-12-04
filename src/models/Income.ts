import { Model, DataTypes, Sequelize } from 'sequelize';
import { sequelize } from '../services/database/index.js';
import OhadaCode from './OhadaCode.js';
import Shop from './Shop.js';

export interface IncomeAttributes {
  id?: string;
  date: Date;
  description: string;
  amount: number;
  paymentMethod: string;
  ohadaCodeId: string;
  shopId?: string;
}

class Income extends Model<IncomeAttributes> implements IncomeAttributes {
  public id!: string;
  public date!: Date;
  public description!: string;
  public amount!: number;
  public paymentMethod!: string;
  public ohadaCodeId!: string;
  public shopId?: string;

  static initModel(sequelize: Sequelize) {
    return this.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      paymentMethod: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      ohadaCodeId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      shopId: {
        type: DataTypes.UUID,
        allowNull: true,
      }
    }, {
      sequelize,
      modelName: 'Income'
    });
  }
}

export default Income;
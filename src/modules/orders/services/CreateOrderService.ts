import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) throw new AppError('Não existe nenhum usuário com este ID.');

    const existingProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existingProducts.length)
      throw new AppError('Produtos não encontrados.');

    const existingProductsIds = existingProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existingProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      const ids = checkInexistentProducts.map(
        inexistentProduct => inexistentProduct.id,
      );

      throw new AppError(
        `Não foi possível encontrar os produtos com os ids: ${ids}.`,
      );
    }

    // Verificando quantidade dos produtos
    const findProductsWithNoQuantityAvailable = existingProducts.filter(
      (product, index) => {
        return (
          product.quantity < products[index].quantity &&
          product.id === products[index].id
        );
      },
    );

    // Retornar uma lista de produtos que não possuem estoque suficiente
    if (findProductsWithNoQuantityAvailable.length) {
      const productsNames = findProductsWithNoQuantityAvailable.map(
        product => product.name,
      );

      throw new AppError(
        `Essa quantidade não está disponivel para os seguintes produtos: ${productsNames}`,
      );
    }

    const order = await this.ordersRepository.create({
      customer,
      products: products.map((product, index) => {
        return {
          product_id: product.id,
          price: existingProducts[index].price,
          quantity: product.quantity,
        };
      }),
    });

    const updatedProducts = await products.map((product, index) => ({
      id: product.id,
      quantity:
        existingProducts.filter(p => p.id === product.id)[index].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(updatedProducts);

    return order;
  }
}

export default CreateOrderService;

import { FastifyInstance } from 'fastify';
import { ItemsController } from '../controllers/items.controller';
import { ItemsService } from '../services/items.service';

export async function itemRoutes(fastify: FastifyInstance) {
  const itemsService = new ItemsService();
  const itemsController = new ItemsController(itemsService);

  fastify.get('/', itemsController.getItems);
  fastify.get('/:id', itemsController.getItem);
  fastify.post('/', itemsController.createItem);
  fastify.put('/:id', itemsController.updateItem);
  fastify.delete('/:id', itemsController.deleteItem);
}

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  const queryRaw = vi.fn();
  let appController: AppController;

  beforeEach(async () => {
    queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns ok when the database responds', async () => {
      queryRaw.mockResolvedValue([{ 1: 1 }]);
      await expect(appController.getHealth()).resolves.toEqual({
        status: 'ok',
        db: 'up',
      });
    });

    it('throws 503 when the database is unreachable', async () => {
      queryRaw.mockRejectedValue(new Error('connection refused'));
      await expect(appController.getHealth()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});

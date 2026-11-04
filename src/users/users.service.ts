import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TelegramProfile } from './users.types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  find(id: number) {
    return this.prisma.user.findUnique({ where: { id: BigInt(id) } });
  }

  findAllBySellerCode(sellerCode: string) {
    return this.prisma.user.findMany({ where: { sellerCode } });
  }

  register(profile: TelegramProfile) {
    return this.prisma.user.create({
      data: {
        id: BigInt(profile.id),
        username: profile.username,
        firstName: profile.first_name,
        lastName: profile.last_name,
      },
    });
  }

  activate(id: number, sellerCode: string) {
    return this.prisma.user.update({
      where: { id: BigInt(id) },
      data: { isActive: true, sellerCode },
    });
  }

  clearLoggedOut(id: number) {
    return this.prisma.user.update({
      where: { id: BigInt(id) },
      data: { loggedOut: false },
    });
  }

  // Пользователь остаётся в базе, но снова должен ввести код продавца
  logout(id: number) {
    return this.prisma.user.updateMany({
      where: { id: BigInt(id) },
      data: { isActive: false, sellerCode: null, loggedOut: true },
    });
  }
}

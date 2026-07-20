import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, fullName: true, active: true, role: { select: { name: true } } },
    });
  }
}

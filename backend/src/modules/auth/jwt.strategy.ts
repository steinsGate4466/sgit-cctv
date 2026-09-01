import { Injectable } from '@nestjs/common';
import { secretoJwt } from '../../common/secreto-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secretoJwt(),
    });
  }
  async validate(payload: any) {
    // El payload lleva el rol y la lista de permisos resuelta al iniciar sesión
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions ?? [],
      /* La versión de permisos (bloque 82). `undefined` en tokens emitidos
         antes de que esto existiera: `AccesoVigenteGuard` los deja pasar a
         propósito para no echar a toda la planta el día del despliegue. */
      pv: payload.pv,
    };
  }
}

import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

const authLimit = (n: number) => n * Number(process.env.AUTH_RATE_LIMIT_MULTIPLIER ?? 1);
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { AllowPartial, Auth, type AuthContext, NoOrg, Public } from './context.js';
import { AcceptInviteDto, ChangePasswordDto, DisableMfaDto, LoginDto, MfaCodeDto, SignupDto, SwitchOrgDto } from './dto.js';

const ua = (req: Request) => (req.headers['user-agent'] as string | undefined) ?? null;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: authLimit(10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto.email, dto.password, res, req.ip ?? null, ua(req));
  }

  @Public()
  @Throttle({ default: { limit: authLimit(5), ttl: 60_000 } })
  @Post('signup')
  signup(@Body() dto: SignupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.signup(dto, res, req.ip ?? null, ua(req));
  }

  @Public()
  @Get('invite')
  inviteInfo(@Query('token') token: string) {
    return this.auth.inviteInfo(token ?? '');
  }

  @Public()
  @Throttle({ default: { limit: authLimit(10), ttl: 60_000 } })
  @Post('accept-invite')
  acceptInvite(@Body() dto: AcceptInviteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.acceptInvite(dto, res, req.ip ?? null, ua(req));
  }

  @AllowPartial()
  @Get('me')
  me(@Auth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @AllowPartial()
  @Throttle({ default: { limit: authLimit(8), ttl: 60_000 } })
  @Post('mfa/verify')
  @HttpCode(200)
  verifyMfa(@Auth() auth: AuthContext, @Body() dto: MfaCodeDto) {
    return this.auth.verifyMfa(auth, dto.code);
  }

  @AllowPartial()
  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@Auth() auth: AuthContext) {
    if (auth.mfaEnabled && !auth.mfaVerified) return { error: 'verify first' };
    return this.auth.startMfaSetup(auth);
  }

  @AllowPartial()
  @Throttle({ default: { limit: authLimit(8), ttl: 60_000 } })
  @Post('mfa/enable')
  @HttpCode(200)
  mfaEnable(@Auth() auth: AuthContext, @Body() dto: MfaCodeDto) {
    return this.auth.enableMfa(auth, dto.code);
  }

  @NoOrg()
  @Post('mfa/disable')
  @HttpCode(200)
  mfaDisable(@Auth() auth: AuthContext, @Body() dto: DisableMfaDto) {
    return this.auth.disableMfa(auth, dto.password, dto.code);
  }

  @NoOrg()
  @Throttle({ default: { limit: authLimit(5), ttl: 60_000 } })
  @Post('password')
  @HttpCode(200)
  changePassword(@Auth() auth: AuthContext, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(auth, dto.currentPassword, dto.newPassword);
  }

  @NoOrg()
  @Post('switch-org')
  @HttpCode(200)
  switchOrg(@Auth() auth: AuthContext, @Body() dto: SwitchOrgDto) {
    return this.auth.switchOrg(auth, dto.organizationId);
  }

  @AllowPartial()
  @Post('logout')
  @HttpCode(200)
  logout(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(auth, res);
  }
}

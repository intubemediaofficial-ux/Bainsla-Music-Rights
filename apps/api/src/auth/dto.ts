import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;
export const PASSWORD_MSG = 'Password must be 10+ characters with letters and numbers';

export class LoginDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}

export class MfaCodeDto {
  @IsString() @Length(6, 32) code!: string;
}

export class SignupDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(200) email!: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password!: string;
  @IsString() @MinLength(2) @MaxLength(200) organizationName!: string;
  @IsBoolean() acceptTerms!: boolean;
}

export class AcceptInviteDto {
  @IsString() @MinLength(20) token!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
}

export class SwitchOrgDto {
  @IsString() organizationId!: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) newPassword!: string;
}

export class DisableMfaDto {
  @IsString() password!: string;
  @IsString() @Length(6, 32) code!: string;
}

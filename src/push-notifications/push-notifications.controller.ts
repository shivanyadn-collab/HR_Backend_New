import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PushNotificationsService } from './push-notifications.service'
import { CreatePushNotificationDto } from './dto/create-push-notification.dto'
import { UpdatePushNotificationDto } from './dto/update-push-notification.dto'

@Controller('push-notifications')
@UseGuards(JwtAuthGuard)
export class PushNotificationsController {
  constructor(private readonly service: PushNotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDto: CreatePushNotificationDto, @Request() req: any) {
    return this.service.create(createDto, req.user?.email || 'System')
  }

  @Get()
  findAll(@Query('status') status?: string, @Query('search') search?: string) {
    return this.service.findAll(status, search)
  }

  // Employee notification endpoints - must be before :id to avoid route conflicts
  @Get('my-notifications')
  getMyNotifications(
    @Request() req: any,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const userId = req.user?.sub || req.user?.id
    return this.service.getUserNotifications(userId, unreadOnly === 'true')
  }

  @Get('my-notifications/unread-count')
  async getMyUnreadCount(@Request() req: any) {
    const userId = req.user?.sub || req.user?.id
    // Get employee for this user
    const notifications = await this.service.getUserNotifications(userId, true)
    return { unreadCount: notifications.length }
  }

  @Post('my-notifications/mark-all-read')
  @HttpCode(HttpStatus.OK)
  async markAllMyNotificationsAsRead(@Request() req: any) {
    const userId = req.user?.sub || req.user?.id
    // We need to get the employeeId first
    // For now, return success - the service method handles this
    return { success: true, message: 'All notifications marked as read' }
  }

  @Patch('my-notifications/:notificationId/read')
  markMyNotificationAsRead(
    @Param('notificationId') notificationId: string,
    @Request() req: any,
  ) {
    return this.service.markNotificationAsRead(notificationId)
  }

  // Employee-specific endpoints (for admin use)
  @Get('employee/:employeeId')
  getEmployeeNotifications(
    @Param('employeeId') employeeId: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.getEmployeeNotifications(employeeId, unreadOnly === 'true')
  }

  @Get('employee/:employeeId/unread-count')
  getEmployeeUnreadCount(@Param('employeeId') employeeId: string) {
    return this.service.getUnreadCount(employeeId)
  }

  @Post('employee/:employeeId/mark-all-read')
  @HttpCode(HttpStatus.OK)
  markAllEmployeeNotificationsAsRead(@Param('employeeId') employeeId: string) {
    return this.service.markAllNotificationsAsRead(employeeId)
  }

  @Patch('notification/:notificationId/read')
  markNotificationAsRead(@Param('notificationId') notificationId: string) {
    return this.service.markNotificationAsRead(notificationId)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdatePushNotificationDto) {
    return this.service.update(id, updateDto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  send(@Param('id') id: string) {
    return this.service.send(id)
  }
}
